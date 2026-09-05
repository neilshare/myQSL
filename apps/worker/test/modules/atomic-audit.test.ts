import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ownerHeaders = {
  "Content-Type": "application/json",
  "X-EQSR-Test-Actor": "owner",
  Origin: "http://localhost:8787",
  "X-MYQSL-Request": "1"
};

async function ownerJson(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`https://example.test${path}`, {
    ...init,
    headers: { ...ownerHeaders, ...(init.headers ?? {}) },
    body: init.body ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined
  });
}

describe("Atomic Writes & Conditional Audit (Phase B1)", () => {
  it("does not insert audit event on stale QSO update", async () => {
    // 1. Setup station & QSO
    await ownerJson("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ callsign: "BA4RC", is_default: true })
    });

    const createRes = await ownerJson("/api/v1/qsos", {
      method: "POST",
      body: JSON.stringify({
        station_callsign: "BA4RC",
        call: "BG4ABC",
        qso_date: "20260904",
        time_on: "1000",
        band: "20M",
        mode: "SSB",
        freq_mhz: "14.225",
        comment: "Original comment"
      })
    });
    expect(createRes.status).toBe(201);
    const qso = (await createRes.json() as { data: { id: number; version: number } }).data;

    // Count audit events before stale update
    const auditCountBefore = (
      await (env as any).DB.prepare("SELECT count(*) as cnt FROM audit_events WHERE entity = 'qso' AND entity_id = ?")
        .bind(String(qso.id))
        .first<{ cnt: number }>()
    )?.cnt ?? 0;

    // 2. Attempt stale update (wrong version in If-Match)
    const staleRes = await ownerJson(`/api/v1/qsos/${qso.id}`, {
      method: "PATCH",
      headers: { "If-Match": `W/"qso-${qso.id}-${qso.version + 99}"` },
      body: JSON.stringify({ comment: "Stale update attempt" })
    });
    expect(staleRes.status).toBe(412);

    // 3. Verify that NO new audit event was inserted
    const auditCountAfter = (
      await (env as any).DB.prepare("SELECT count(*) as cnt FROM audit_events WHERE entity = 'qso' AND entity_id = ?")
        .bind(String(qso.id))
        .first<{ cnt: number }>()
    )?.cnt ?? 0;
    expect(auditCountAfter).toBe(auditCountBefore);

    // 4. Verify QSO row in DB is completely untouched
    const currentQso = await (env as any).DB.prepare("SELECT comment, version FROM qsos WHERE id = ?")
      .bind(qso.id)
      .first<{ comment: string; version: number }>();
    expect(currentQso?.comment).toBe("Original comment");
    expect(currentQso?.version).toBe(qso.version);
  });

  it("handles empty PATCH without incrementing version or writing audit", async () => {
    const createRes = await ownerJson("/api/v1/qsos", {
      method: "POST",
      body: JSON.stringify({
        station_callsign: "BA4RC",
        call: "BG4DEF",
        qso_date: "20260904",
        time_on: "1015",
        band: "40M",
        mode: "CW"
      })
    });
    const qso = (await createRes.json() as { data: { id: number; version: number } }).data;

    const auditCountBefore = (
      await (env as any).DB.prepare("SELECT count(*) as cnt FROM audit_events WHERE entity = 'qso' AND entity_id = ?")
        .bind(String(qso.id))
        .first<{ cnt: number }>()
    )?.cnt ?? 0;

    // Send empty patch {}
    const emptyPatchRes = await ownerJson(`/api/v1/qsos/${qso.id}`, {
      method: "PATCH",
      headers: { "If-Match": `W/"qso-${qso.id}-${qso.version}"` },
      body: JSON.stringify({})
    });
    expect(emptyPatchRes.status).toBe(200);

    const auditCountAfter = (
      await (env as any).DB.prepare("SELECT count(*) as cnt FROM audit_events WHERE entity = 'qso' AND entity_id = ?")
        .bind(String(qso.id))
        .first<{ cnt: number }>()
    )?.cnt ?? 0;
    expect(auditCountAfter).toBe(auditCountBefore);

    const dbQso = await (env as any).DB.prepare("SELECT version FROM qsos WHERE id = ?")
      .bind(qso.id)
      .first<{ version: number }>();
    expect(dbQso?.version).toBe(qso.version);
  });

  it("updates only specified fields without wiping unmentioned fields and maps freq_mhz to freq_hz", async () => {
    const createRes = await ownerJson("/api/v1/qsos", {
      method: "POST",
      body: JSON.stringify({
        station_callsign: "BA4RC",
        call: "BG4GHI",
        qso_date: "20260904",
        time_on: "1100",
        band: "20M",
        mode: "SSB",
        freq_mhz: "14.225",
        name: "Old Name",
        comment: "Old Note"
      })
    });
    const qso = (await createRes.json() as { data: { id: number; version: number } }).data;

    // Update only comment
    const patchCommentRes = await ownerJson(`/api/v1/qsos/${qso.id}`, {
      method: "PATCH",
      headers: { "If-Match": `W/"qso-${qso.id}-${qso.version}"` },
      body: JSON.stringify({ comment: "  Leading spaces preserved  " })
    });
    expect(patchCommentRes.status).toBe(200);
    const patched1 = (await patchCommentRes.json() as { data: { comment: string; name: string; freq_mhz: string; version: number } }).data;
    expect(patched1.comment).toBe("  Leading spaces preserved  ");
    expect(patched1.name).toBe("Old Name");
    expect(patched1.freq_hz).toBe(14_225_000);
    expect(patched1.version).toBe(qso.version + 1);

    // Update freq_mhz to a new string
    const patchFreqRes = await ownerJson(`/api/v1/qsos/${qso.id}`, {
      method: "PATCH",
      headers: { "If-Match": `W/"qso-${qso.id}-${patched1.version}"` },
      body: JSON.stringify({ freq_mhz: "14.250" })
    });
    expect(patchFreqRes.status).toBe(200);
    const patched2 = (await patchFreqRes.json() as { data: { freq_hz: number; version: number } }).data;
    expect(patched2.freq_hz).toBe(14_250_000);

    // Check DB integer freq_hz
    const dbRow = await (env as any).DB.prepare("SELECT freq_hz, comment, name FROM qsos WHERE id = ?")
      .bind(qso.id)
      .first<{ freq_hz: number; comment: string; name: string }>();
    expect(dbRow?.freq_hz).toBe(14_250_000);
    expect(dbRow?.comment).toBe("  Leading spaces preserved  ");
    expect(dbRow?.name).toBe("Old Name");
  });

  it("recomputes dedupe_key on band/mode patch and returns 409 on unique collision", async () => {
    // 1. Create first QSO
    await ownerJson("/api/v1/qsos", {
      method: "POST",
      body: JSON.stringify({
        station_callsign: "BA4RC",
        call: "BG4JKL",
        qso_date: "20260904",
        time_on: "1200",
        band: "40M",
        mode: "SSB"
      })
    });

    // 2. Create second QSO with same call/time but different band
    const res2 = await ownerJson("/api/v1/qsos", {
      method: "POST",
      body: JSON.stringify({
        station_callsign: "BA4RC",
        call: "BG4JKL",
        qso_date: "20260904",
        time_on: "1200",
        band: "20M",
        mode: "SSB"
      })
    });
    expect(res2.status).toBe(201);
    const qso2 = (await res2.json() as { data: { id: number; version: number } }).data;

    // 3. Patch qso2's band to 40M (which would collide with first QSO!)
    const patchRes = await ownerJson(`/api/v1/qsos/${qso2.id}`, {
      method: "PATCH",
      headers: { "If-Match": `W/"qso-${qso2.id}-${qso2.version}"` },
      body: JSON.stringify({ band: "40M" })
    });
    expect(patchRes.status).toBe(409);
    const problem = await patchRes.json() as { type: string; status: number };
    expect(problem.status).toBe(409);
    expect(problem.type).toBe("https://myqsl.app/problems/duplicate");
  });

  it("preserves old default station when setting new default fails due to stale version", async () => {
    // 1. Create station 1 as default
    const s1Res = await ownerJson("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ callsign: "STATION1", is_default: true })
    });
    expect(s1Res.status).toBe(201);
    const s1 = (await s1Res.json() as { data: { id: number; is_default: number; version: number } }).data;

    // 2. Create station 2 as non-default
    const s2Res = await ownerJson("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ callsign: "STATION2", is_default: false })
    });
    expect(s2Res.status).toBe(201);
    const s2 = (await s2Res.json() as { data: { id: number; is_default: number; version: number } }).data;

    // 3. Attempt to set station 2 as default with stale version (e.g. s2.version + 50)
    const staleToggleRes = await ownerJson(`/api/v1/stations/${s2.id}`, {
      method: "PATCH",
      headers: { "If-Match": `W/"station-${s2.id}-${s2.version + 50}"` },
      body: JSON.stringify({ callsign: "STATION2", is_default: true })
    });
    expect(staleToggleRes.status).toBe(412);

    // 4. Verify station 1 is STILL the default station!
    const s1Db = await (env as any).DB.prepare("SELECT is_default FROM stations WHERE id = ?")
      .bind(s1.id)
      .first<{ is_default: number }>();
    expect(s1Db?.is_default).toBe(1);

    // 5. Verify station 2 is STILL non-default
    const s2Db = await (env as any).DB.prepare("SELECT is_default FROM stations WHERE id = ?")
      .bind(s2.id)
      .first<{ is_default: number }>();
    expect(s2Db?.is_default).toBe(0);
  });
});
