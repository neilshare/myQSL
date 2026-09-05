import type { Hono } from "hono";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { MediaStore } from "../../platform/r2";
import { QsoRepository } from "../qsos/repository";
import { TemplateRepository } from "../templates/repository";
import { CardRepository } from "./repository";
import { CardService } from "./service";
import { problem } from "../../platform/problem";
import { AuditWriter } from "../../platform/audit";

import { z } from "zod";

const createCardSchema = z.object({
  qso_id: z.number().int().positive(),
  template_id: z.number().int().positive()
});

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
  app.get("/api/v1/cards/:id", async (c) => {
    const card = await service(c).get(c.req.param("id"));
    if (!card) {
      return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Card not found", c.req.path);
    }
    return c.json({ data: card });
  });
  app.post("/api/v1/cards", async (c) => {
    try {
      const body = createCardSchema.parse(await c.req.json());
      const card = await service(c).createDraft(body.qso_id, body.template_id);
      const audit = new AuditWriter(c.env.DB);
      await audit.append({
        actor: c.get("actor") ?? "unknown",
        action: "create_card",
        entity: "card",
        entityId: card.id,
        requestId: c.get("requestId") ?? "unknown",
        detail: { qso_id: card.qso_id, template_id: card.template_id },
        createdAt: Date.now()
      });
      return c.json({ data: card }, 201);
    } catch (error) {
      return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid card", c.req.path);
    }
  });
  app.on(["POST", "PUT"], "/api/v1/cards/:id/image", async (c) => {
    try {
      const row = await service(c).attachImage(c.req.param("id"), await c.req.arrayBuffer(), c.req.header("X-Content-SHA256"));
      const audit = new AuditWriter(c.env.DB);
      await audit.append({
        actor: c.get("actor") ?? "unknown",
        action: "attach_card_image",
        entity: "card",
        entityId: row.id,
        requestId: c.get("requestId") ?? "unknown",
        detail: { r2_key: row.image_r2_key, sha256: row.content_sha256 },
        createdAt: Date.now()
      });
      return c.json({ data: row });
    } catch (error) {
      return problem(409, "https://myqsl.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card image rejected", c.req.path);
    }
  });
  app.post("/api/v1/cards/:id/publish", async (c) => {
    try {
      const row = await service(c).publish(c.req.param("id"));
      const audit = new AuditWriter(c.env.DB);
      await audit.append({
        actor: c.get("actor") ?? "unknown",
        action: "publish_card",
        entity: "card",
        entityId: row.id,
        requestId: c.get("requestId") ?? "unknown",
        detail: { public_id: row.public_id },
        createdAt: Date.now()
      });
      return c.json({ data: row });
    } catch (error) {
      return problem(409, "https://myqsl.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card cannot be published", c.req.path);
    }
  });
  app.post("/api/v1/cards/:id/void", async (c) => {
    try {
      const row = await service(c).void(c.req.param("id"));
      const audit = new AuditWriter(c.env.DB);
      await audit.append({
        actor: c.get("actor") ?? "unknown",
        action: "void_card",
        entity: "card",
        entityId: row.id,
        requestId: c.get("requestId") ?? "unknown",
        createdAt: Date.now()
      });
      return c.json({ data: row });
    } catch (error) {
      return problem(409, "https://myqsl.app/problems/card-state", "Invalid card state", error instanceof Error ? error.message : "Card cannot be voided", c.req.path);
    }
  });
}
