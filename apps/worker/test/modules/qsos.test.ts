import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ownerHeaders = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };
const station = { callsign: "BA4RC", is_default: true };
const validQso = {
  station_callsign: "BA4RC",
  call: "BG4YYY",
  qso_date: "20260903",
  time_on: "1430",
  band: "40m",
  mode: "SSB"
};

async function ownerJson(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`https://example.test${path}`, {
    ...init,
    headers: { ...ownerHeaders, ...(init.headers ?? {}) },
    body: init.body ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined
  });
}

describe("QSO management", () => {
  it("rejects a hard duplicate and preserves an explicit legal duplicate", async () => {
    await ownerJson("/api/v1/stations", { method: "POST", body: JSON.stringify(station) });
    const first = await ownerJson("/api/v1/qsos", { method: "POST", body: JSON.stringify(validQso) });
    const second = await ownerJson("/api/v1/qsos", { method: "POST", body: JSON.stringify(validQso) });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect((await second.json() as { duplicate_of: number }).duplicate_of).toBe((await first.clone().json() as { data: { id: number } }).data.id);
    const preserved = await ownerJson("/api/v1/qsos", { method: "POST", body: JSON.stringify({ ...validQso, preserve_duplicate: true, duplicate_reason: "contest log correction" }) });
    expect(preserved.status).toBe(201);
  });

  it("enforces If-Match and soft-delete/restore semantics", async () => {
    const created = await ownerJson("/api/v1/qsos", { method: "POST", body: JSON.stringify({ ...validQso, call: "BD1ZZZ", time_on: "1500" }) });
    const body = (await created.json()) as { data: { id: number; version: number } };
    const stale = await ownerJson(`/api/v1/qsos/${body.data.id}`, { method: "PATCH", headers: { "If-Match": `W/\"qso-${body.data.id}-${body.data.version - 1}\"` }, body: JSON.stringify({ comment: "late write" }) });
    expect(stale.status).toBe(412);
    const deleted = await ownerJson(`/api/v1/qsos/${body.data.id}`, { method: "DELETE", headers: { "If-Match": `W/\"qso-${body.data.id}-${body.data.version}\"` } });
    expect(deleted.status).toBe(204);
    const visible = await ownerJson(`/api/v1/qsos/${body.data.id}`);
    expect(visible.status).toBe(404);
    const restored = await ownerJson(`/api/v1/qsos/${body.data.id}/restore`, { method: "POST" });
    expect(restored.status).toBe(200);
  });
});
