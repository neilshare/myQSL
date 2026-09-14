import type { Hono } from "hono";
import { z } from "zod";
import { AnyCardTemplateSchema, CardTemplateSchema } from "@myqsl/domain";
import type { Env } from "../../env";
import { MediaStore } from "../../platform/r2";
import { problem } from "../../platform/problem";
import { AuditWriter } from "../../platform/audit";
import type { RequestVariables } from "../../platform/request-context";
import { TemplateRepository } from "./repository";
import { TemplateService } from "./service";
import { sha256Hex } from "./asset-service";

const idSchema = z.coerce.number().int().positive();
const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  layout: z.unknown().optional(),
  schema_version: z.number().int().positive().optional(),
  base_width: z.number().int().positive().optional(),
  base_height: z.number().int().positive().optional(),
  elements: z.array(z.unknown()).optional()
});

export function registerTemplateRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/card-templates", async (c) => { const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)); return c.json({ data: await service.list() }); });
  app.post("/api/v1/card-templates", async (c) => {
    let idempotencyKey: string | null = null;
    let repository: TemplateRepository | null = null;
    try {
      const parsed = createTemplateSchema.parse(await c.req.json());
      const layout = parsed.layout ?? {
        schema_version: parsed.schema_version,
        base_width: parsed.base_width,
        base_height: parsed.base_height,
        elements: parsed.elements
      };
      repository = new TemplateRepository(c.env.DB);
      const service = new TemplateService(repository, new MediaStore(c.env.MEDIA));
      idempotencyKey = c.req.header("Idempotency-Key")?.trim() || null;
      if (idempotencyKey) {
        if (idempotencyKey.length > 160) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Idempotency-Key is too long", c.req.path);
        const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify({ name: parsed.name, layout })));
        const reservation = await repository.reserveCreateRequest(idempotencyKey, requestHash, Date.now());
        const existing = reservation.row;
        if (existing.request_hash !== requestHash) return problem(409, "https://myqsl.app/problems/conflict", "Conflict", "Idempotency-Key was already used for a different request", c.req.path);
        if (existing.template_id !== null) {
          const replay = await repository.get(existing.template_id);
          if (!replay) return problem(409, "https://myqsl.app/problems/conflict", "Conflict", "Idempotent template result is unavailable", c.req.path);
          return c.json({ data: replay }, 201);
        }
        if (!reservation.inserted) {
          return problem(409, "https://myqsl.app/problems/conflict", "Conflict", "Idempotent request is still in progress", c.req.path);
        }
      }
      const created = await service.create({ name: parsed.name, layout });
      if (idempotencyKey) await repository.completeCreateRequest(idempotencyKey, created.id);
      const audit = new AuditWriter(c.env.DB);
      await audit.append({
        actor: c.get("actor") ?? "unknown",
        action: "create_template",
        entity: "card_template",
        entityId: String(created.id),
        requestId: c.get("requestId") ?? "unknown",
        detail: { name: created.name },
        createdAt: Date.now()
      });
      return c.json({ data: created }, 201);
    } catch (error) {
      if (idempotencyKey && repository) await repository.releaseCreateRequest(idempotencyKey);
      return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid template", c.req.path);
    }
  });
  app.get("/api/v1/card-templates/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);
    const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA));
    const row = await service.get(id.data);
    if (!row) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Template not found", c.req.path);
    return c.json({ data: row });
  });
  app.get("/api/v1/card-templates/:id/background", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);
    const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA));
    const row = await service.get(id.data);
    if (!row || !row.background_r2_key) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Background not found", c.req.path);
    const object = await c.env.MEDIA.get(row.background_r2_key);
    if (!object) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Background not found", c.req.path);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "image/png",
        ETag: row.background_sha256 ? `"${row.background_sha256}"` : object.httpEtag,
        "Cache-Control": "private, no-cache"
      }
    });
  });
  app.post("/api/v1/card-templates/:id/assets", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);
    const repository = new TemplateRepository(c.env.DB);
    const template = await repository.get(id.data);
    if (!template) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Template not found", c.req.path);
    try {
      const body = await c.req.arrayBuffer();
      const asset = await new TemplateService(repository, new MediaStore(c.env.MEDIA)).uploadAsset(id.data, body, c.req.header("Content-Type") ?? "application/octet-stream");
      return c.json({ data: { asset_id: asset.id, template_id: asset.template_id, mime: asset.mime, width: asset.width, height: asset.height, bytes: asset.byte_size, sha256: asset.sha256 } }, 201);
    } catch (error) {
      return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid asset", c.req.path);
    }
  });
  app.get("/api/v1/card-templates/:id/assets/:assetId", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    const assetId = c.req.param("assetId");
    if (!id.success || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(assetId)) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid asset id", c.req.path);
    const repository = new TemplateRepository(c.env.DB);
    const asset = await repository.getAsset(id.data, assetId);
    if (!asset) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Asset not found", c.req.path);
    const object = await c.env.MEDIA.get(asset.r2_key);
    if (!object) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Asset not found", c.req.path);
    return new Response(object.body, { headers: { "Content-Type": asset.mime, ETag: `"${asset.sha256}"`, "Cache-Control": "private, no-cache" } });
  });
  app.patch("/api/v1/card-templates/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid JSON payload", c.req.path);
    }

    let version: number | undefined;
    const ifMatch = c.req.header("If-Match");
    if (ifMatch) {
      const match = ifMatch.trim().match(/^"?(\d+)"?$/);
      if (match) {
        version = parseInt(match[1], 10);
      }
    }
    if (version === undefined && typeof body.version === "number" && Number.isInteger(body.version)) {
      version = body.version;
    }

    if (version === undefined) {
      return problem(428, "https://myqsl.app/problems/precondition-required", "Precondition Required", "Version is required for template update (If-Match or body.version)", c.req.path);
    }

    const templateRepo = new TemplateRepository(c.env.DB);
    const service = new TemplateService(templateRepo, new MediaStore(c.env.MEDIA));
    const current = await service.get(id.data);
    if (!current) {
      return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Template not found", c.req.path);
    }

    if (current.version !== version) {
      return problem(412, "https://myqsl.app/problems/precondition-failed", "Precondition Failed", `Version conflict: expected ${version}, current is ${current.version}`, c.req.path);
    }

    try {
      let layoutJson = current.layout_json;
      if (body.layout !== undefined) {
        const parsed = AnyCardTemplateSchema.parse(body.layout);
        layoutJson = JSON.stringify(parsed);
      } else if (body.elements !== undefined) {
        const parsed = CardTemplateSchema.parse({
          schema_version: body.schema_version ?? current.schema_version,
          base_width: body.base_width ?? current.base_width,
          base_height: body.base_height ?? current.base_height,
          elements: body.elements
        });
        layoutJson = JSON.stringify(parsed);
      } else if (body.base_width !== undefined || body.base_height !== undefined) {
        const existing = JSON.parse(current.layout_json);
        const parsed = CardTemplateSchema.parse({
          ...existing,
          base_width: body.base_width ?? current.base_width,
          base_height: body.base_height ?? current.base_height
        });
        layoutJson = JSON.stringify(parsed);
      }

      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : current.name;
      const now = Date.now();
      const assetIds = service.extractAssetIds(layoutJson);
      if (!(await templateRepo.assetsBelongToTemplate(id.data, assetIds))) {
        return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Template references an asset owned by another template", c.req.path);
      }

      const updateStmt = templateRepo.buildUpdateStatement(id.data, version, { name, layoutJson, now });
      const audit = new AuditWriter(c.env.DB);
      const auditStmt = audit.buildConditionalStatement({
        actor: c.get("actor") ?? "unknown",
        action: "template_update",
        entity: "card_template",
        entityId: String(id.data),
        requestId: c.get("requestId") ?? "unknown",
        detail: { name, version: version + 1 },
        createdAt: now
      });

      const refStatements = [templateRepo.buildDeleteTemplateAssetRefs(id.data), ...assetIds.map((assetId) => templateRepo.buildInsertTemplateAssetRef(id.data, assetId, now))];
      const batchResults = await c.env.DB.batch([updateStmt, ...refStatements, auditStmt]);
      if (batchResults[0].meta.changes === 0) {
        return problem(412, "https://myqsl.app/problems/precondition-failed", "Precondition Failed", "Concurrent template update conflict", c.req.path);
      }

      const updated = await templateRepo.get(id.data);
      return c.json({ data: updated }, 200, { ETag: `"${updated!.version}"` });
    } catch (error) {
      return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid template", c.req.path);
    }
  });

  app.on(["POST", "PUT"], "/api/v1/card-templates/:id/background", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);
    try { const body = await c.req.arrayBuffer(); const result = await new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)).uploadBackground(id.data, body, c.req.header("Content-Type") ?? "application/octet-stream"); return c.json({ data: result }, 201); }
    catch (error) { return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid background", c.req.path); }
  });
}
