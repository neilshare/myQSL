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
function encodeCardCursor(c: { created_at: number; id: string }): string {
  return btoa(JSON.stringify(c));
}
function decodeCardCursor(s: string): { created_at: number; id: string } | undefined {
  try {
    const obj = JSON.parse(atob(s));
    if (typeof obj.created_at === "number" && typeof obj.id === "string") return obj;
  } catch {}
  return undefined;
}

export function registerCardRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/cards", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
    const cursorStr = c.req.query("cursor");
    const cursor = cursorStr ? decodeCardCursor(cursorStr) : undefined;
    const rows = await service(c).list(cursor, limit);
    const next_cursor = rows.length === limit ? encodeCardCursor({ created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }) : null;
    return c.json({ data: rows, next_cursor });
  });
  app.post("/api/v1/cards", async (c) => { try { const body = await c.req.json() as { qso_id: number; template_id: number }; return c.json({ data: await service(c).createDraft(body.qso_id, body.template_id) }, 201); } catch (error) { return problem(422, "https://eqsr.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid card", c.req.path); } });
  app.post("/api/v1/cards/:id/image", async (c) => { try { const row = await service(c).attachImage(c.req.param("id"), await c.req.arrayBuffer(), c.req.header("X-Content-SHA256")); return c.json({ data: row }); } catch (error) { return problem(409, "https://eqsr.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card image rejected", c.req.path); } });
  app.post("/api/v1/cards/:id/publish", async (c) => { try { const row = await service(c).publish(c.req.param("id")); return c.json({ data: row }); } catch (error) { return problem(409, "https://eqsr.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card cannot be published", c.req.path); } });
  app.post("/api/v1/cards/:id/void", async (c) => { try { const row = await service(c).void(c.req.param("id")); return c.json({ data: row }); } catch (error) { return problem(409, "https://eqsr.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card cannot be voided", c.req.path); } });
}
