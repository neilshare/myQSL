import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import { enforceLookupLimit } from "../../platform/rate-limit";
import { problem } from "../../platform/problem";
import type { RequestVariables } from "../../platform/request-context";
import { CardRepository } from "../cards/repository";
import { PublicCardService } from "./service";

const lookupSchema = z.object({ call: z.string().trim().regex(/^[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*$/).min(4).max(16), qso_date: z.string().regex(/^\d{8}$/) });
export function registerPublicRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/public/cards/:publicId", async (c) => {
    const service = new PublicCardService(new CardRepository(c.env.DB), c.env.PUBLIC_ORIGIN);
    const raw = await service.getRaw(c.req.param("publicId"));
    if (!raw || raw.status === "draft" || raw.status === "ready") return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Published card not found", c.req.path);
    if (raw.status === "void") return problem(410, "https://myqsl.app/problems/void-card", "Card voided", "This card is no longer available", c.req.path);
    const view = await service.get(c.req.param("publicId"));
    return new Response(JSON.stringify(view), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  });
  app.get("/api/v1/public/cards/:publicId/image", async (c) => {
    const row = await new PublicCardService(new CardRepository(c.env.DB), c.env.PUBLIC_ORIGIN).getRaw(c.req.param("publicId"));
    if (!row || row.status === "draft" || row.status === "ready") return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Card image not found", c.req.path);
    if (row.status === "void") return problem(410, "https://myqsl.app/problems/void-card", "Card voided", "This card is no longer available", c.req.path);
    if (!row.image_r2_key) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Card image not found", c.req.path);
    const object = await c.env.MEDIA.get(row.image_r2_key);
    if (!object) return problem(404, "https://myqsl.app/problems/not-found", "Not found", "Card image not found", c.req.path);
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/png", ETag: row.content_sha256 ? `"${row.content_sha256}"` : object.httpEtag, "Cache-Control": "public, max-age=31536000, immutable" } });
  });
  app.post("/api/v1/public/card-lookup", async (c) => {
    const startTime = Date.now();
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Invalid JSON payload", c.req.path);
    }
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Exact call and UTC date are required", c.req.path);
    const rateLimitRes = await enforceLookupLimit(c, parsed.data.call);
    if (rateLimitRes) return rateLimitRes;
    const result = await new PublicCardService(new CardRepository(c.env.DB), c.env.PUBLIC_ORIGIN).lookup(parsed.data.call.toUpperCase(), parsed.data.qso_date);
    const elapsed = Date.now() - startTime;
    if (elapsed < 150) {
      await new Promise((resolve) => setTimeout(resolve, 150 - elapsed));
    }
    return c.json({ data: result }, 200, { "Cache-Control": "no-store" });
  });
}
