import type { Hono } from "hono";
import { z } from "zod";
import { CardTemplateSchema } from "@eqsr/domain";
import type { Env } from "../../env";
import { MediaStore } from "../../platform/r2";
import { problem } from "../../platform/problem";
import type { RequestVariables } from "../../platform/request-context";
import { TemplateRepository } from "./repository";
import { TemplateService } from "./service";

const idSchema = z.coerce.number().int().positive();
export function registerTemplateRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/templates", async (c) => { const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)); return c.json({ data: await service.list() }); });
  app.post("/api/v1/templates", async (c) => {
    try { const body = await c.req.json() as { name: string; layout: unknown } & Record<string, unknown>; const layout = body.layout ?? { schema_version: body.schema_version, base_width: body.base_width, base_height: body.base_height, elements: body.elements }; const service = new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)); return c.json({ data: await service.create({ name: body.name, layout }) }, 201); }
    catch (error) { return problem(422, "https://eqsr.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid template", c.req.path); }
  });
  app.post("/api/v1/templates/:id/background", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://eqsr.app/problems/validation", "Validation failed", "Invalid template id", c.req.path);
    try { const body = await c.req.arrayBuffer(); const result = await new TemplateService(new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)).uploadBackground(id.data, body, c.req.header("Content-Type") ?? "application/octet-stream"); return c.json({ data: result }, 201); }
    catch (error) { return problem(422, "https://eqsr.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid background", c.req.path); }
  });
}
