import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ownerHeaders = {
  "Content-Type": "application/json",
  "X-EQSR-Test-Actor": "test-operator",
  Origin: "http://localhost:8787",
  "X-EQSR-Request": "1"
};

describe("Readiness & Audit security boundary", () => {
  it("protects /readyz probe with owner auth and confirms D1 connectivity", async () => {
    // 1. Unauthenticated request to /readyz should return 401
    const unauth = await exports.default.fetch("http://localhost:8787/readyz");
    expect(unauth.status).toBe(401);

    // 2. Authenticated request to /readyz should return 200 with ready status
    const auth = await exports.default.fetch("http://localhost:8787/readyz", {
      headers: ownerHeaders
    });
    expect(auth.status).toBe(200);
    const body = await auth.json() as { status: string; d1: string };
    expect(body.status).toBe("ready");
    expect(body.d1).toBe("connected");
  });

  it("atomically records an audit event when a QSO is created", async () => {
    // Create station first
    await exports.default.fetch("http://localhost:8787/api/v1/stations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ callsign: "BA4RC", is_default: true })
    });

    const qsoPayload = {
      station_callsign: "BA4RC",
      call: "BG4AUDIT",
      qso_date: "20260904",
      time_on: "123000",
      band: "20M",
      mode: "FT8",
      rst_sent: "+02",
      rst_rcvd: "-05",
      comment: "Audit test contact"
    };

    const res = await exports.default.fetch("http://localhost:8787/api/v1/qsos", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(qsoPayload)
    });
    expect(res.status).toBe(201);

    // Verify audit event exists in database
    const audit = await env.DB.prepare(
      "SELECT * FROM audit_events WHERE action = 'create_qso' ORDER BY id DESC LIMIT 1"
    ).first<{ actor: string; action: string; entity: string; detail_json: string }>();

    expect(audit).not.toBeNull();
    expect(audit?.actor).toBe("test-operator");
    expect(audit?.entity).toBe("qso");
    expect(audit?.detail_json).toContain("BG4AUDIT");
  });
});
