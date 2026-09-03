import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };
const validQso = { station_callsign: "BA4RC", call: "BG4YYY", qso_date: "20260903", time_on: "1430", band: "40m", mode: "SSB" };

async function request(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`https://example.test${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

describe("resumable ADIF imports", () => {
  it("replays the same chunk without writing QSO rows twice", async () => {
    await request("/api/v1/stations", { method: "POST", body: JSON.stringify({ callsign: "BA4RC", is_default: true }) });
    const jobResponse = await request("/api/v1/imports", { method: "POST", body: JSON.stringify({ file_name: "log.adi", file_sha256: "a".repeat(64), total_records: 1 }) });
    const job = (await jobResponse.json() as { data: { id: string } }).data;
    const command = { chunk_index: 0, checksum: "b".repeat(64), idempotency_key: "idem-00000000-0000-4000-8000-000000000001", records: [validQso] };
    const first = await request(`/api/v1/imports/${job.id}/chunks`, { method: "POST", body: JSON.stringify(command) });
    const replay = await request(`/api/v1/imports/${job.id}/chunks`, { method: "POST", body: JSON.stringify(command) });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.clone().json()).toEqual(await first.clone().json());
  });

  it("rejects a chunk containing more than 40 records", async () => {
    const response = await request("/api/v1/imports/job/chunks", { method: "POST", body: JSON.stringify({ chunk_index: 0, checksum: "c".repeat(64), idempotency_key: "idem-limit", records: Array.from({ length: 41 }, () => validQso) }) });
    expect(response.status).toBe(422);
  });
});
