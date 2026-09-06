import type { Hono } from "hono";
import { RadioEventSchema } from "@myqsl/domain";
import type { Env } from "../../env";
import { requireAgent } from "../../platform/agent-auth";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { EventKeyConflictError, EventValidationError, IngestService, ProfileScopeError } from "./service";

const MAX_EVENT_BYTES = 64 * 1024;

export function registerIngestRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.use("/api/v1/agent/*", requireAgent);
  app.get("/api/v1/agent/config", async (c) => {
    const agent = c.get("agent");
    const profiles: { results: Array<Record<string, unknown>> } = agent.profileIds.length === 0 ? { results: [] } : await c.env.DB.prepare(
      "SELECT id, source_kind, source_instance, expected_station_callsign FROM agent_profiles WHERE device_id = ? AND enabled = 1 ORDER BY id"
    ).bind(agent.deviceId).all();
    c.header("Cache-Control", "no-store");
    return c.json({ data: { protocol_version: 1, server_time: new Date().toISOString(), profiles: profiles.results, limits: { max_event_bytes: MAX_EVENT_BYTES, max_inflight: 2 } } });
  });

  app.post("/api/v1/agent/heartbeat", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    return c.json({ data: { accepted: true, server_time: new Date().toISOString(), agent_version: typeof body.agent_version === "string" ? body.agent_version.slice(0, 40) : null } });
  });

  app.post("/api/v1/agent/events", async (c) => {
    const length = Number(c.req.header("Content-Length") ?? 0);
    if (length > MAX_EVENT_BYTES) return problem(413, "https://myqsl.app/problems/payload-too-large", "Payload too large", `Event exceeds ${MAX_EVENT_BYTES} bytes`, c.req.path);
    const text = await c.req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_EVENT_BYTES) return problem(413, "https://myqsl.app/problems/payload-too-large", "Payload too large", `Event exceeds ${MAX_EVENT_BYTES} bytes`, c.req.path);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return problem(422, "https://myqsl.app/problems/validation", "Validation failed", "Request body must be valid JSON", c.req.path); }
    const parsed = RadioEventSchema.safeParse(body);
    if (!parsed.success) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", parsed.error.message, c.req.path);
    try {
      const result = await new IngestService(c.env.DB).ingest(parsed.data, c.get("agent"));
      return c.json({ data: result.receipt }, result.status);
    } catch (error) {
      if (error instanceof EventKeyConflictError) return problem(409, "https://myqsl.app/problems/event-key-reused", "Event key reused", error.message, c.req.path, { code: "EVENT_KEY_REUSED", retryable: false });
      if (error instanceof ProfileScopeError) return problem(403, "https://myqsl.app/problems/station-scope", "Profile scope mismatch", error.message, c.req.path, { code: "STATION_SCOPE_MISMATCH", retryable: false });
      if (error instanceof EventValidationError) return problem(422, "https://myqsl.app/problems/validation", "Validation failed", error.message, c.req.path, { code: "PAYLOAD_HASH_MISMATCH", retryable: false });
      console.error("agent ingest failed", error);
      return problem(503, "https://myqsl.app/problems/service-unavailable", "Ingest unavailable", "The event was not committed; retry with the same event_id", c.req.path, { retryable: true });
    }
  });
}
