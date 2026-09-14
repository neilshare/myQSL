import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };

describe("template API", () => {
  it("lists immutable V2 presets without seeding the user template table", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS count FROM card_templates").first<{ count: number }>();
    const first = await exports.default.fetch("https://example.test/api/v1/card-template-presets", { method: "GET", headers });
    const second = await exports.default.fetch("https://example.test/api/v1/card-template-presets", { method: "GET", headers });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const presets = ((await first.json()) as { data: Array<{ id: string; layout: { schema_version: number } }> }).data;
    expect(presets.map((preset) => preset.id)).toEqual(["classic-dx", "photo-journal", "minimal-grid"]);
    expect(presets.every((preset) => preset.layout.schema_version === 2)).toBe(true);
    const after = await env.DB.prepare("SELECT COUNT(*) AS count FROM card_templates").first<{ count: number }>();
    expect(after?.count).toBe(before?.count);
  });

  it("rejects absolute coordinates and stores a valid template", async () => {
    const invalid = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers, body: JSON.stringify({ name: "bad", schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 120, y: 0.5, field: "call" }] }) });
    expect(invalid.status).toBe(422);
    const valid = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers, body: JSON.stringify({ name: "clean", schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 0.5, y: 0.5, field: "call" }] }) });
    expect(valid.status).toBe(201);
  });

  it("persists background R2 key, sha256, and increments version upon background upload", async () => {
    const createRes = await exports.default.fetch("https://example.test/api/v1/card-templates", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "bg-test", schema_version: 1, base_width: 1264, base_height: 848, elements: [] })
    });
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: { id: number; version: number } }).data;
    expect(created.version).toBe(1);

    // Upload a valid PNG (starts with [137, 80, 78, 71, 13, 10, 26, 10])
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
    const uploadRes = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}/background`, {
      method: "POST",
      headers: {
        "X-EQSR-Test-Actor": "owner",
        Origin: "http://localhost:8787",
        "X-EQSR-Request": "1",
        "Content-Type": "image/png"
      },
      body: pngBytes
    });
    expect(uploadRes.status).toBe(201);

    // List templates and verify the row has background_r2_key, background_sha256, and version = 2
    const listRes = await exports.default.fetch("https://example.test/api/v1/card-templates", {
      method: "GET",
      headers
    });
    expect(listRes.status).toBe(200);
    const listData = ((await listRes.json()) as { data: Array<{ id: number; background_r2_key: string | null; background_sha256: string | null; version: number }> }).data;
    const target = listData.find((t) => t.id === created.id);
    expect(target).toBeDefined();
    expect(target?.background_r2_key).toBeTruthy();
    expect(target?.background_r2_key).toContain(`templates/${created.id}/`);
    expect(target?.background_sha256).toBeTruthy();
    expect(target?.background_sha256).toBeTruthy();
    expect(target?.version).toBe(2);
  });

  it("rejects a layout PATCH that uses the version captured before a background upload", async () => {
    const createRes = await exports.default.fetch("https://example.test/api/v1/card-templates", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "background-version-regression", schema_version: 1, base_width: 1264, base_height: 848, elements: [] })
    });
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: { id: number; version: number } }).data;

    const uploadRes = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}/background`, {
      method: "POST",
      headers: { "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1", "Content-Type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3])
    });
    expect(uploadRes.status).toBe(201);

    const stalePatch = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, {
      method: "PATCH",
      headers: { ...headers, "If-Match": `"${created.version}"` },
      body: JSON.stringify({ name: "must-not-overwrite" })
    });
    expect(stalePatch.status).toBe(412);

    const currentRes = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, { method: "GET", headers });
    const current = ((await currentRes.json()) as { data: { name: string; version: number; background_r2_key: string | null } }).data;
    expect(current.name).toBe("background-version-regression");
    expect(current.version).toBe(created.version + 1);
    expect(current.background_r2_key).toBeTruthy();
  });

  it("updates template with PATCH using optimistic concurrency (If-Match / version)", async () => {
    // 1. Create template
    const createRes = await exports.default.fetch("https://example.test/api/v1/card-templates", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "patch-test", schema_version: 1, base_width: 1264, base_height: 848, elements: [] })
    });
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: { id: number; version: number } }).data;

    // 2. Reject PATCH without version or If-Match -> 428
    const noVerRes = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "no-ver" })
    });
    expect(noVerRes.status).toBe(428);

    // 3. Reject PATCH with stale version -> 412
    const staleRes = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, {
      method: "PATCH",
      headers: { ...headers, "If-Match": '"999"' },
      body: JSON.stringify({ name: "stale" })
    });
    expect(staleRes.status).toBe(412);

    // 4. Successful PATCH with matching version
    const patchRes = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, {
      method: "PATCH",
      headers: { ...headers, "If-Match": `"${created.version}"` },
      body: JSON.stringify({
        name: "patch-updated-name",
        base_width: 1920,
        base_height: 1080
      })
    });
    expect(patchRes.status).toBe(200);
    const updated = ((await patchRes.json()) as { data: { id: number; name: string; base_width: number; version: number } }).data;
    expect(updated.name).toBe("patch-updated-name");
    expect(updated.base_width).toBe(1920);
    expect(updated.version).toBe(created.version + 1);

    // 5. Verify audit event was recorded for template_update
    const auditRow = await env.DB.prepare(
      "SELECT * FROM audit_events WHERE entity = 'card_template' AND entity_id = ? AND action = 'template_update'"
    ).bind(String(created.id)).first();
    expect(auditRow).toBeDefined();
  });
});
