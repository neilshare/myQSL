import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { PrintBatchError, PrintService } from "./service";

const requestSchema = z.object({ kind: z.enum(["qso", "card"]), qso_ids: z.array(z.coerce.number().int().positive()).max(200).optional(), card_ids: z.array(z.string().min(1).max(80)).max(200).optional(), template_id: z.coerce.number().int().positive().optional(), template_version: z.coerce.number().int().positive().optional(), profile: z.enum(["a4-four-up-v1", "single-bleed-v1"]).default("a4-four-up-v1"), qr_policy: z.enum(["require_published", "omit_confirmed"]).default("require_published") });
const completeSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/iu), size_bytes: z.number().int().positive().max(50 * 1024 * 1024), page_count: z.number().int().positive().max(50), renderer_version: z.string().min(1).max(80), preflight_report_hash: z.string().regex(/^[a-f0-9]{64}$/iu) });

function service(c: { env: Env }) { return new PrintService(c.env); }
function handle(error: unknown, path: string): Response { if (error instanceof PrintBatchError) return problem(error.status, `https://myqsl.app/problems/${error.code.toLowerCase()}`, error.code, error.message, path, { code: error.code, retryable: false }); return problem(500, "https://myqsl.app/problems/internal", "Internal error", "Print batch operation failed", path); }

export function registerPrintingRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/print-batches", async (c) => {
    const key = c.req.header("Idempotency-Key")?.trim(); if (!key || key.length > 120) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Idempotency-Key is required", c.req.path);
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path);
    try { const result = await service(c).create(parsed.data, key); return c.json({ data: result.manifest, replayed: result.replayed }, result.replayed ? 200 : 201); } catch (error) { return handle(error, c.req.path); }
  });
  app.get("/api/v1/print-batches/:id", async (c) => { try { return c.json({ data: await service(c).getManifest(c.req.param("id")) }); } catch (error) { return handle(error, c.req.path); } });
  app.get("/api/v1/print-batches/:id/items", async (c) => { const limit = Number(c.req.query("limit") ?? "20"); const cursor = Number(c.req.query("cursor") ?? "0"); try { return c.json({ data: await service(c).items(c.req.param("id"), limit, cursor) }); } catch (error) { return handle(error, c.req.path); } });
  app.post("/api/v1/print-batches/:id/complete", async (c) => { const parsed = completeSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path); try { await service(c).complete(c.req.param("id"), parsed.data); return c.json({ data: { completed: true } }); } catch (error) { return handle(error, c.req.path); } });
  app.post("/api/v1/print-batches/:id/cancel", async (c) => { try { await service(c).cancel(c.req.param("id")); return c.json({ data: { cancelled: true } }); } catch (error) { return handle(error, c.req.path); } });
  app.get("/api/v1/print-batches/:id/assets/:assetId", async (c) => {
    const item = await c.env.DB.prepare("SELECT background_asset_id FROM print_batch_items WHERE batch_id = ? AND background_asset_id = ?").bind(c.req.param("id"), c.req.param("assetId")).first<{ background_asset_id: string }>();
    if (!item) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Print asset is not referenced by this batch", c.req.path);
    const object = await c.env.MEDIA.get(item.background_asset_id); if (!object) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Print asset not found", c.req.path);
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Cache-Control": "private, no-store" } });
  });
}
