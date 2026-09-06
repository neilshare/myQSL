import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { DeliveryError, DeliveryService } from "./service";
import { handleResendWebhook, verifyWebhookSignature } from "./webhook";

const createSchema = z.object({ card_ids: z.array(z.string().min(1).max(80)).min(1).max(50), language: z.enum(["zh", "en"]).default("zh"), attachment_mode: z.enum(["png", "link_only"]).default("png") });
const sendSchema = z.object({ delivery_ids: z.array(z.string().min(1).max(100)).min(1).max(50), preview_version: z.number().int().positive() });
function service(c: { env: Env }) { return new DeliveryService(c.env); }
function handle(error: unknown, path: string): Response { if (error instanceof DeliveryError) return problem(error.status, `https://myqsl.app/problems/${error.code.toLowerCase()}`, error.code, error.message, path, { code: error.code, retryable: false }); return problem(500, "https://myqsl.app/problems/internal", "Internal error", "Delivery operation failed", path); }

export function registerDeliveryRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/delivery-settings/status", (c) => c.json({ data: { qrz_configured: Boolean(c.env.QRZ_USERNAME && c.env.QRZ_PASSWORD), provider_configured: Boolean(c.env.RESEND_API_KEY && c.env.RESEND_FROM), quota_daily: Number(c.env.EMAIL_DAILY_QUOTA ?? "100") } }));
  app.post("/api/v1/delivery-batches", async (c) => {
    const key = c.req.header("Idempotency-Key")?.trim(); if (!key) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Idempotency-Key is required", c.req.path);
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path);
    try { const result = await service(c).create(parsed.data, key); c.executionCtx.waitUntil(service(c).prepare(result.id)); return c.json({ data: { id: result.id, status: "preparing" }, replayed: result.replayed }, 202); } catch (error) { return handle(error, c.req.path); }
  });
  app.get("/api/v1/delivery-batches/:id", async (c) => { try { return c.json({ data: await service(c).get(c.req.param("id")) }); } catch (error) { return handle(error, c.req.path); } });
  app.post("/api/v1/delivery-batches/:id/send", async (c) => { const parsed = sendSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path); try { return c.json({ data: await service(c).send(c.req.param("id"), parsed.data.delivery_ids, parsed.data.preview_version) }, 202); } catch (error) { return handle(error, c.req.path); } });
  app.post("/api/v1/webhooks/resend", async (c) => {
    const body = await c.req.text();
    if (new TextEncoder().encode(body).byteLength > 256 * 1024) return problem(413, "https://myqsl.app/problems/payload-too-large", "Payload too large", "Webhook payload exceeds 256 KiB", c.req.path);
    if (!c.env.RESEND_WEBHOOK_SECRET || !(await verifyWebhookSignature(body, c.req.raw.headers, c.env.RESEND_WEBHOOK_SECRET))) return problem(401, "https://myqsl.app/problems/auth-invalid", "Invalid signature", "Webhook signature is invalid", c.req.path);
    try { const result = await handleResendWebhook(c.env, body); return c.json({ data: { accepted: true, duplicate: result.duplicate, applied: result.applied } }); } catch { return problem(422, "https://myqsl.app/problems/validation", "Invalid webhook", "Webhook payload is invalid", c.req.path); }
  });
}
