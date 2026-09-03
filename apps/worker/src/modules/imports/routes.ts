import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import { problem } from "../../platform/problem";
import type { RequestVariables } from "../../platform/request-context";
import { ImportConflictError, ImportService } from "./service";
import { ImportRepository } from "./repository";

const createSchema = z.object({ file_name: z.string().min(1).max(255), file_sha256: z.string().regex(/^[a-f0-9]{64}$/iu), total_records: z.number().int().nonnegative() });
const chunkSchema = z.object({ chunk_index: z.number().int().nonnegative(), checksum: z.string().regex(/^[a-f0-9]{64}$/iu), idempotency_key: z.string().min(1).max(128), records: z.array(z.unknown()) });

export function registerImportRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/imports", async (c) => {
    try { const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB); return c.json({ data: await service.createJob(createSchema.parse(await c.req.json())) }, 201); }
    catch (error) { return problem(422, "https://eqsr.app/problems/validation", "Validation failed", error instanceof Error ? error.message : "Invalid import job", c.req.path); }
  });
  app.post("/api/v1/imports/:id/chunks", async (c) => {
    try { const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB); return c.json(await service.acceptChunk(c.req.param("id"), chunkSchema.parse(await c.req.json()))); }
    catch (error) { const status = error instanceof ImportConflictError ? 409 : 422; return problem(status, `https://eqsr.app/problems/${status === 409 ? "conflict" : "validation"}`, status === 409 ? "Conflict" : "Validation failed", error instanceof Error ? error.message : "Invalid import chunk", c.req.path); }
  });
  app.post("/api/v1/imports/:id/complete", async (c) => {
    try { const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB); return c.json({ data: await service.complete(c.req.param("id")) }); }
    catch (error) { return problem(404, "https://eqsr.app/problems/not-found", "Not found", error instanceof Error ? error.message : "Import job not found", c.req.path); }
  });
}
