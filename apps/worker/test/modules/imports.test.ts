import { calculateChunkChecksum } from "@myqsl/domain";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = {
  "Content-Type": "application/json",
  "X-EQSR-Test-Actor": "owner",
  Origin: "http://localhost:8787",
  "X-EQSR-Request": "1"
};

const validQso = {
  station_callsign: "BA4RC",
  call: "BG4YYY",
  qso_date: "20260903",
  time_on: "143000",
  band: "40m",
  mode: "SSB"
};

async function request(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`https://example.test${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) }
  });
}

describe("resumable ADIF imports", () => {
  it("replays the same chunk without writing QSO rows twice", async () => {
    await request("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ callsign: "BA4RC", is_default: true })
    });
    const jobResponse = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "log.adi", file_sha256: "a".repeat(64), total_records: 1 })
    });
    const job = ((await jobResponse.json()) as { data: { id: string } }).data;
    const records = [validQso];
    const checksum = await calculateChunkChecksum(records);
    const command = {
      chunk_index: 0,
      checksum,
      idempotency_key: "idem-00000000-0000-4000-8000-000000000001",
      records
    };
    const first = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify(command)
    });
    const replay = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify(command)
    });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.clone().json()).toEqual(await first.clone().json());

    // Verify only 1 QSO was inserted
    const qsosRes = await request("/api/v1/qsos");
    const qsosBody = (await qsosRes.json()) as { data: unknown[] };
    expect(qsosBody.data.length).toBe(1);
  });

  it("rejects checksum mismatch with 422", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "test.adi", file_sha256: "b".repeat(64), total_records: 1 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;
    const command = {
      chunk_index: 0,
      checksum: "0".repeat(64), // wrong checksum
      idempotency_key: "idem-bad-chksum",
      records: [validQso]
    };
    const res = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify(command)
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(/checksum/i);
  });

  it("rejects conflicting checksum for the same chunk index with 409", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "conflict.adi", file_sha256: "c".repeat(64), total_records: 1 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;
    const records1 = [validQso];
    const checksum1 = await calculateChunkChecksum(records1);
    const first = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 0,
        checksum: checksum1,
        idempotency_key: "idem-conflict-1",
        records: records1
      })
    });
    expect(first.status).toBe(200);

    const records2 = [{ ...validQso, call: "BH4XXX" }];
    const checksum2 = await calculateChunkChecksum(records2);
    const conflict = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 0,
        checksum: checksum2,
        idempotency_key: "idem-conflict-2",
        records: records2
      })
    });
    expect(conflict.status).toBe(409);
  });

  it("rejects non-sequential chunk submission with 422", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "seq.adi", file_sha256: "d".repeat(64), total_records: 80 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;
    const records = Array.from({ length: 40 }, (_, i) => ({
      ...validQso,
      call: `BG4${String(i).padStart(3, "0")}`
    }));
    const checksum = await calculateChunkChecksum(records);

    // Try sending chunk 1 before chunk 0
    const res = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 1,
        checksum,
        idempotency_key: "idem-seq-1",
        records
      })
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(/sequential/i);
  });

  it("rejects non-tail chunk that does not match chunk_size (40 records)", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "size.adi", file_sha256: "e".repeat(64), total_records: 80 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;
    // Chunk 0 needs 40 records, but we send 20
    const records = Array.from({ length: 20 }, (_, i) => ({
      ...validQso,
      call: `BG4${String(i).padStart(3, "0")}`
    }));
    const checksum = await calculateChunkChecksum(records);

    const res = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 0,
        checksum,
        idempotency_key: "idem-size-short",
        records
      })
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(/invalid chunk size/i);
  });

  it("classifies into 4 buckets: ready, warning (soft duplicate), duplicate (hard duplicate), rejected", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "buckets.adi", file_sha256: "f".repeat(64), total_records: 4 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;

    const records = [
      // 0: Ready - fresh record
      { ...validQso, call: "BH1AAA", time_on: "100000" },
      // 1: Warning - soft duplicate of record 0 (same station, call, band, mode, +60s)
      { ...validQso, call: "BH1AAA", time_on: "100100" },
      // 2: Duplicate - exact duplicate of record 0 (same dedupe key)
      { ...validQso, call: "BH1AAA", time_on: "100000" },
      // 3: Rejected - invalid date
      { ...validQso, call: "BH1AAA", qso_date: "invalid" }
    ];
    const checksum = await calculateChunkChecksum(records);

    const chunkRes = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 0,
        checksum,
        idempotency_key: "idem-buckets-test",
        records
      })
    });
    expect(chunkRes.status).toBe(200);
    const chunkData = (await chunkRes.json()) as {
      classifications: Array<{
        index: number;
        bucket: string;
        qso_id: number | null;
        duplicate_of: number | null;
        warnings: string[] | null;
        issues: unknown[] | null;
      }>;
    };

    const classifications = chunkData.classifications;
    expect(classifications).toHaveLength(4);
    expect(classifications[0].bucket).toBe("ready");
    expect(classifications[0].qso_id).toBeTypeOf("number");

    expect(classifications[1].bucket).toBe("warning");
    expect(classifications[1].qso_id).toBeTypeOf("number");
    expect(classifications[1].warnings).toBeDefined();

    expect(classifications[2].bucket).toBe("duplicate");
    expect(classifications[2].qso_id).toBeNull();

    expect(classifications[3].bucket).toBe("rejected");
    expect(classifications[3].qso_id).toBeNull();
    expect(classifications[3].issues).toBeDefined();

    // Verify GET /api/v1/imports/:id returns correct counts and confirmed chunks
    const statusRes = await request(`/api/v1/imports/${job.id}`);
    expect(statusRes.status).toBe(200);
    const statusBody = (await statusRes.json()) as {
      data: {
        id: string;
        status: string;
        counts: { accepted: number; warning: number; duplicate: number; rejected: number; processed: number };
        confirmed_chunks: Array<{ chunk_index: number; checksum: string; records_count: number }>;
      };
    };
    expect(statusBody.data.counts.accepted).toBe(1);
    expect(statusBody.data.counts.warning).toBe(1);
    expect(statusBody.data.counts.duplicate).toBe(1);
    expect(statusBody.data.counts.rejected).toBe(1);
    expect(statusBody.data.counts.processed).toBe(4);
    expect(statusBody.data.confirmed_chunks).toHaveLength(1);
    expect(statusBody.data.confirmed_chunks[0].records_count).toBe(4);

    // Complete the job
    const completeRes = await request(`/api/v1/imports/${job.id}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(200);
    const completeBody = (await completeRes.json()) as { data: { status: string; completed_at: number } };
    expect(completeBody.data.status).toBe("completed");
    expect(completeBody.data.completed_at).toBeTypeOf("number");

    // Idempotent completion
    const completeReplay = await request(`/api/v1/imports/${job.id}/complete`, { method: "POST" });
    expect(completeReplay.status).toBe(200);

    // Completed job rejects new chunks
    const chunkOnCompleted = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 0,
        checksum: "0".repeat(64),
        idempotency_key: "idem-new-on-completed",
        records: [validQso]
      })
    });
    expect(chunkOnCompleted.status).toBe(409);
  });

  it("handles 0-record job completion immediately", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "empty.adi", file_sha256: "0".repeat(64), total_records: 0 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;

    const completeRes = await request(`/api/v1/imports/${job.id}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(200);
    const completeBody = (await completeRes.json()) as { data: { status: string } };
    expect(completeBody.data.status).toBe("completed");
  });

  it("successfully handles full 40 records chunk within statement and parameter limits", async () => {
    const jobRes = await request("/api/v1/imports", {
      method: "POST",
      body: JSON.stringify({ file_name: "full40.adi", file_sha256: "1".repeat(64), total_records: 40 })
    });
    const job = ((await jobRes.json()) as { data: { id: string } }).data;

    const records = Array.from({ length: 40 }, (_, i) => ({
      ...validQso,
      call: `BG4F${String(i).padStart(2, "0")}`,
      time_on: `12${String(i).padStart(2, "0")}00`
    }));
    const checksum = await calculateChunkChecksum(records);

    const res = await request(`/api/v1/imports/${job.id}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        chunk_index: 0,
        checksum,
        idempotency_key: "idem-full-40",
        records
      })
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { classifications: Array<{ bucket: string; qso_id: number }> };
    expect(data.classifications).toHaveLength(40);
    for (const item of data.classifications) {
      expect(item.bucket).toBe("ready");
      expect(item.qso_id).toBeTypeOf("number");
    }

    const completeRes = await request(`/api/v1/imports/${job.id}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(200);
  });
});
