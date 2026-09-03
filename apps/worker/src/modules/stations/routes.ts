import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { StationRepository } from "./repository";
import { StationService } from "./service";

const idSchema = z.coerce.number().int().positive();
const stationInput = z.object({
  callsign: z.string(),
  station_callsign: z.string().nullable().optional(),
  operator_callsign: z.string().nullable().optional(),
  grid_square: z.string().nullable().optional(),
  qth: z.string().nullable().optional(),
  rig: z.string().nullable().optional(),
  antenna: z.string().nullable().optional(),
  power_w: z.number().int().nonnegative().nullable().optional(),
  is_default: z.boolean().optional()
});

function jsonError(error: unknown, path: string): Response {
  if (error instanceof z.ZodError) return problem(422, "https://eqsr.app/problems/validation", "Validation failed", error.message, path);
  return problem(500, "https://eqsr.app/problems/internal", "Internal error", "Unexpected station error", path);
}

export function registerStationRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/stations", async (c) => {
    const service = new StationService(new StationRepository(c.env.DB));
    return c.json({ data: await service.list() });
  });
  app.post("/api/v1/stations", async (c) => {
    try {
      const service = new StationService(new StationRepository(c.env.DB));
      const created = await service.create(stationInput.parse(await c.req.json()));
      return c.json({ data: created }, 201);
    } catch (error) {
      return jsonError(error, c.req.path);
    }
  });
  app.patch("/api/v1/stations/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    const version = Number(c.req.header("If-Match")?.match(/station-\d+-(\d+)/u)?.[1]);
    if (!id.success || !Number.isInteger(version)) return problem(412, "https://eqsr.app/problems/precondition", "Precondition required", "A current station ETag is required", c.req.path);
    try {
      const service = new StationService(new StationRepository(c.env.DB));
      const updated = await service.update(id.data, version, stationInput.parse(await c.req.json()));
      if (!updated) return problem(412, "https://eqsr.app/problems/stale", "Stale version", "The station changed since it was read", c.req.path);
      c.header("ETag", `W/"station-${updated.id}-${updated.version}"`);
      return c.json({ data: updated });
    } catch (error) {
      return jsonError(error, c.req.path);
    }
  });
}
