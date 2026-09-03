import type { Hono } from "hono";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { MediaStore } from "../../platform/r2";
import { QsoRepository } from "../qsos/repository";
import { TemplateRepository } from "../templates/repository";
import { CardRepository } from "./repository";
import { CardService } from "./service";
import { problem } from "../../platform/problem";

function service(c: { env: Env }) { return new CardService(new CardRepository(c.env.DB), new QsoRepository(c.env.DB), new TemplateRepository(c.env.DB), new MediaStore(c.env.MEDIA)); }
export function registerCardRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/cards", async (c) => { try { const body = await c.req.json() as { qso_id: number; template_id: number }; return c.json({ data: await service(c).createDraft(body.qso_id, body.template_id) }, 201); } catch (error) { return problem(422, "https://eqsr.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid card", c.req.path); } });
  app.post("/api/v1/cards/:id/image", async (c) => { try { const row = await service(c).attachImage(c.req.param("id"), await c.req.arrayBuffer(), c.req.header("X-Content-SHA256")); return c.json({ data: row }); } catch (error) { return problem(409, "https://eqsr.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card image rejected", c.req.path); } });
  app.post("/api/v1/cards/:id/publish", async (c) => { try { const row = await service(c).publish(c.req.param("id")); return c.json({ data: row }); } catch (error) { return problem(409, "https://eqsr.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card cannot be published", c.req.path); } });
}
