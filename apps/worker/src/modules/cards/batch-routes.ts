import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { CardBatchError, CardBatchService } from "./batch-service";

const schema = z.object({ qso_ids: z.array(z.coerce.number().int().positive()).min(1).max(50), qso_versions: z.record(z.string(), z.coerce.number().int().positive()).optional(), template_id: z.coerce.number().int().positive(), template_version: z.coerce.number().int().positive().optional() });
export function registerCardBatchRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/card-batches", async (c) => { const key = c.req.header("Idempotency-Key"); if (!key) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Idempotency-Key is required", c.req.path); const parsed = schema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path); try { const result = await new CardBatchService(c.env).create(parsed.data, key); return c.json({ data: result }, result.replayed ? 200 : 201); } catch (error) { if (error instanceof CardBatchError) return problem(error.status, `https://myqsl.app/problems/${error.code.toLowerCase()}`, error.code, error.message, c.req.path, { code: error.code }); return problem(500, "https://myqsl.app/problems/internal", "Internal error", "Card batch failed", c.req.path); } });
  app.get("/api/v1/card-batches/:id", async (c) => { try { return c.json({ data: await new CardBatchService(c.env).get(c.req.param("id")) }); } catch (error) { if (error instanceof CardBatchError) return problem(error.status, "https://myqsl.app/problems/not-found", "Not found", error.message, c.req.path); return problem(500, "https://myqsl.app/problems/internal", "Internal error", "Card batch failed", c.req.path); } });
}
