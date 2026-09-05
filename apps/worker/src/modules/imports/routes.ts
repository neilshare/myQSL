import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import { problem } from "../../platform/problem";
import type { RequestVariables } from "../../platform/request-context";
import { ImportConflictError, ImportService, ImportValidationError } from "./service";
import { ImportRepository } from "./repository";

const createSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_sha256: z.string().regex(/^[a-f0-9]{64}$/iu),
  total_records: z.number().int().nonnegative()
});

const chunkSchema = z.object({
  chunk_index: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/iu),
  idempotency_key: z.string().min(1).max(128),
  records: z.array(z.unknown())
});

export function registerImportRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/imports", async (c) => {
    try {
      const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB);
      const parsed = createSchema.parse(await c.req.json());
      const job = await service.createJob(parsed);
      return c.json({ data: job }, 201);
    } catch (error) {
      return problem(
        422,
        "https://myqsl.app/problems/validation",
        "Validation failed",
        error instanceof Error ? error.message : "Invalid import job",
        c.req.path
      );
    }
  });

  app.get("/api/v1/imports/:id", async (c) => {
    try {
      const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB);
      const summary = await service.getJobStatus(c.req.param("id"));
      if (!summary) {
        return problem(
          404,
          "https://myqsl.app/problems/not-found",
          "Not found",
          "Import job not found",
          c.req.path
        );
      }
      return c.json({ data: summary });
    } catch (error) {
      return problem(
        500,
        "https://myqsl.app/problems/internal",
        "Internal error",
        error instanceof Error ? error.message : "Failed to load import job",
        c.req.path
      );
    }
  });

  app.post("/api/v1/imports/:id/chunks", async (c) => {
    try {
      const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB);
      const parsed = chunkSchema.parse(await c.req.json());
      const actor = c.get("actor") ?? "system";
      const requestId = c.get("requestId") ?? "system";
      const result = await service.acceptChunk(c.req.param("id"), parsed, actor, requestId);
      return c.json(result);
    } catch (error) {
      if (error instanceof ImportConflictError) {
        return problem(
          409,
          "https://myqsl.app/problems/conflict",
          "Conflict",
          error.message,
          c.req.path
        );
      }
      return problem(
        422,
        "https://myqsl.app/problems/validation",
        "Validation failed",
        error instanceof Error ? error.message : "Invalid import chunk",
        c.req.path
      );
    }
  });

  app.post("/api/v1/imports/:id/complete", async (c) => {
    try {
      const service = new ImportService(new ImportRepository(c.env.DB), c.env.DB);
      const actor = c.get("actor") ?? "system";
      const job = await service.complete(c.req.param("id"), actor);
      return c.json({ data: job });
    } catch (error) {
      if (error instanceof ImportValidationError) {
        if (error.message.includes("not found")) {
          return problem(
            404,
            "https://myqsl.app/problems/not-found",
            "Not found",
            error.message,
            c.req.path
          );
        }
        return problem(
          422,
          "https://myqsl.app/problems/validation",
          "Validation failed",
          error.message,
          c.req.path
        );
      }
      return problem(
        500,
        "https://myqsl.app/problems/internal",
        "Internal error",
        error instanceof Error ? error.message : "Failed to complete import job",
        c.req.path
      );
    }
  });
}
