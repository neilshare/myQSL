import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import { enforcePublicLimit } from "../../platform/rate-limit";
import { problem } from "../../platform/problem";
import type { RequestVariables } from "../../platform/request-context";
import { CardRepository } from "../cards/repository";
import { PublicCardService } from "./service";

const lookupSchema = z.object({ call: z.string().trim().regex(/^[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*$/).min(4).max(16), qso_date: z.string().regex(/^\d{8}$/) });
export function registerPublicRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/public/cards/:publicId", async (c) => { const view = await new PublicCardService(new CardRepository(c.env.DB), c.env.PUBLIC_ORIGIN).get(c.req.param("publicId")); if (!view) return problem(404, "https://eqsr.app/problems/not-found", "Not found", "Published card not found", c.req.path); return new Response(JSON.stringify(view), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }); });
  app.post("/api/v1/public/lookup", enforcePublicLimit, async (c) => { const parsed = lookupSchema.safeParse(await c.req.json()); if (!parsed.success) return problem(422, "https://eqsr.app/problems/validation", "Validation failed", "Exact call and UTC date are required", c.req.path); const result = await new PublicCardService(new CardRepository(c.env.DB), c.env.PUBLIC_ORIGIN).lookup(parsed.data.call.toUpperCase(), parsed.data.qso_date); return c.json({ data: result }, 200, { "Cache-Control": "public, max-age=60" }); });
}
