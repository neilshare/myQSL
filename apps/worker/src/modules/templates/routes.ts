import type { Hono } from "hono";
import { z } from "zod";
import { CardTemplateSchema } from "@myqsl/domain";
import type { Env } from "../../env";
import { MediaStore } from "../../platform/r2";
import { problem } from "../../platform/problem";
import { AuditWriter } from "../../platform/audit";
import type { RequestVariables } from "../../platform/request-context";
import { TemplateRepository } from "./repository";
import { TemplateService } from "./service";

const idSchema = z.coerce.number().int().positive();
export function registerTemplateRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/card-templates", async (c) => { const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)); return c.json({ data: await service.list() }); });
  app.post("/api/v1/card-templates", async (c) => {
    try { const body = await c.req.json() as { name: string; layout: unknown } & Record<string, unknown>; const layout = body.layout ?? { schema_version: body.schema_version, base_width: body.base_width, base_height: body.base_height, elements: body.elements }; const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)); return c.json({ data: await service.create({ name: body.name, layout }) }, 201); }
    catch (error) { return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid template", c.req.path); }
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
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
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
      const parsed = parseInt(ifMatch.replace(/"/g, "").trim(), 10);
      if (!Number.isNaN(parsed)) version = parsed;
    }
    if (version === undefined && typeof body.version === "number") {
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
        const parsed = CardTemplateSchema.parse(body.layout);
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

      const batchResults = await c.env.DB.batch([updateStmt, auditStmt]);
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
