import type { Hono } from "hono";
import { z } from "zod";
import { decodeCursor, encodeCursor, QsoInputSchema, QsoPatchSchema } from "@myqsl/domain";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { StationRepository } from "../stations/repository";
import { QsoRepository } from "./repository";
import { DuplicateQsoError, PreconditionError, QsoNotFoundError, QsoService } from "./service";
import { toQsoResponse } from "./mapper";

const idSchema = z.coerce.number().int().positive();
const listSchema = z.object({
  call: z.string().trim().optional(),
  band: z.string().trim().optional(),
  mode: z.string().trim().optional(),
  date_from: z.string().trim().optional(),
  date_to: z.string().trim().optional(),
  include_deleted: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

function service(c: { env: Env }) { return new QsoService(new QsoRepository(c.env.DB), new StationRepository(c.env.DB)); }
function etag(row: { id: number; version: number }) { return `W/"qso-${row.id}-${row.version}"`; }
function validation(error: unknown, path: string) {
  if (error instanceof z.ZodError) {
    return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error.message, path);
  }
  const message = error instanceof Error ? error.message : "Unexpected QSO error";
  const isClientError =
    message.includes("station") ||
    message.includes("QSO date") ||
    message.includes("duplicate_reason");
  const status = isClientError ? 422 : 500;
  const type = isClientError ? "https://myqsl.app/problems/validation" : "https://myqsl.app/problems/internal";
  const title = isClientError ? "Validation failed" : "Internal error";
  return problem(status, type, title, message, path);
}

export function registerQsoRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/qsos", async (c) => {
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const auditContext = {
        actor: c.get("actor") ?? "unknown",
        requestId: c.get("requestId") ?? "unknown"
      };
      const result = await service(c).create(
        QsoInputSchema.parse(body),
        {
          preserve_duplicate: body.preserve_duplicate === true,
          duplicate_reason: typeof body.duplicate_reason === "string" ? body.duplicate_reason : undefined
        },
        auditContext
      );
      c.header("ETag", etag(result.qso));
      return c.json({ data: toQsoResponse(result.qso) }, 201);
    } catch (error) {
      if (error instanceof DuplicateQsoError) {
        return new Response(
          JSON.stringify({ type: "https://myqsl.app/problems/duplicate", title: "Duplicate QSO", status: 409, detail: error.message, duplicate_of: error.duplicateOf }),
          { status: 409, headers: { "Content-Type": "application/problem+json; charset=utf-8", "Cache-Control": "no-store" } }
        );
      }
      return validation(error, c.req.path);
    }
  });
  app.get("/api/v1/qsos", async (c) => {
    try {
      const query = listSchema.parse({
        call: c.req.query("call"),
        band: c.req.query("band"),
        mode: c.req.query("mode"),
        date_from: c.req.query("date_from"),
        date_to: c.req.query("date_to"),
        include_deleted: c.req.query("include_deleted"),
        cursor: c.req.query("cursor"),
        limit: c.req.query("limit")
      });
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await service(c).list({
        call: query.call?.toUpperCase(),
        band: query.band?.toUpperCase(),
        mode: query.mode?.toUpperCase(),
        date_from: query.date_from,
        date_to: query.date_to,
        includeDeleted: query.include_deleted === "true",
        cursor,
        limit: query.limit
      });
      const next_cursor = rows.length === query.limit ? encodeCursor({ qso_at: rows[rows.length - 1].qso_at, id: rows[rows.length - 1].id }) : null;
      return c.json({ data: rows.map(toQsoResponse), next_cursor });
    } catch (error) { return validation(error, c.req.path); }
  });
  app.get("/api/v1/qsos/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid QSO id", c.req.path);
    const row = await service(c).get(id.data, c.req.query("include_deleted") === "true");
    if (!row) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "QSO not found", c.req.path);
    c.header("ETag", etag(row));
    return c.json({ data: toQsoResponse(row) });
  });
  app.patch("/api/v1/qsos/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    const match = c.req.header("If-Match")?.match(/^W\/"qso-(\d+)-(\d+)"$/u);
    if (!id.success || !match) return problem(412, "https://myqsl.app/problems/precondition", "Precondition required", "A current QSO ETag is required", c.req.path);
    try {
      const body = await c.req.json();
      const patch = QsoPatchSchema.parse(body);
      const auditContext = {
        actor: c.get("actor") ?? "unknown",
        requestId: c.get("requestId") ?? "unknown"
      };
      const row = await service(c).update(id.data, Number(match[2]), patch, auditContext);
      c.header("ETag", etag(row));
      return c.json({ data: toQsoResponse(row) });
    } catch (error) {
      if (error instanceof DuplicateQsoError) {
        return new Response(
          JSON.stringify({ type: "https://myqsl.app/problems/duplicate", title: "Duplicate QSO", status: 409, detail: error.message, duplicate_of: error.duplicateOf }),
          { status: 409, headers: { "Content-Type": "application/problem+json; charset=utf-8", "Cache-Control": "no-store" } }
        );
      }
      if (error instanceof QsoNotFoundError) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "QSO not found", c.req.path);
      if (error instanceof PreconditionError) return problem(412, "https://myqsl.app/problems/stale", "Stale version", error.message, c.req.path);
      return validation(error, c.req.path);
    }
  });
  app.delete("/api/v1/qsos/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    const match = c.req.header("If-Match")?.match(/^W\/"qso-(\d+)-(\d+)"$/u);
    if (!id.success || !match) return problem(412, "https://myqsl.app/problems/precondition", "Precondition required", "A current QSO ETag is required", c.req.path);
    const auditContext = {
      actor: c.get("actor") ?? "unknown",
      requestId: c.get("requestId") ?? "unknown"
    };
    try {
      await service(c).trash(id.data, Number(match[2]), auditContext);
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof QsoNotFoundError) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "QSO not found", c.req.path);
      if (error instanceof PreconditionError) return problem(412, "https://myqsl.app/problems/stale", "Stale version", "The QSO changed since it was read", c.req.path);
      return validation(error, c.req.path);
    }
  });
  app.post("/api/v1/qsos/:id/restore", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid QSO id", c.req.path);
    const auditContext = {
      actor: c.get("actor") ?? "unknown",
      requestId: c.get("requestId") ?? "unknown"
    };
    try {
      const row = await service(c).restore(id.data, auditContext);
      c.header("ETag", etag(row));
      return c.json({ data: toQsoResponse(row) });
    } catch (error) {
      if (error instanceof QsoNotFoundError) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Deleted QSO not found", c.req.path);
      return validation(error, c.req.path);
    }
  });
}
