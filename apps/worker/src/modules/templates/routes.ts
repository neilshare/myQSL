import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import { MediaStore } from "../../platform/r2";
import { problem } from "../../platform/problem";
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
  app.on(["POST", "PUT"], "/api/v1/card-templates/:id/background", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);
    try { const body = await c.req.arrayBuffer(); const result = await new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)).uploadBackground(id.data, body, c.req.header("Content-Type") ?? "application/octet-stream"); return c.json({ data: result }, 201); }
    catch (error) { return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid background", c.req.path); }
  });
}
