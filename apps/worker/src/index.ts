import { Hono } from "hono";
import type { Env } from "./env";
import { requireOwner } from "./platform/access";
import { requestContext } from "./platform/request-context";
import { requireSameOrigin } from "./platform/origin";
import { enforcePublicLimit } from "./platform/rate-limit";
import { problem, Problems } from "./platform/problem";

const app = new Hono<{ Bindings: Env; Variables: { requestId: string; actor: string } }>();

app.use("*", requestContext);

app.get("/healthz", (c) => c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" }));

app.get("/api/v1/public/lookup", enforcePublicLimit, (c) =>
  problem(404, Problems.notFound, "Not found", "No public lookup has been created yet", c.req.path)
);
app.get("/api/v1/public/cards/:publicId", (c) =>
  problem(404, Problems.notFound, "Not found", "Card not found", c.req.path)
);

app.use("/api/v1/qsos", requireSameOrigin);
app.use("/api/v1/qsos", requireOwner);
app.use("/api/v1/*", requireOwner);
app.get("/api/v1/qsos", (c) => c.json({ data: [], next_cursor: null }));
app.post("/api/v1/qsos", (c) => c.json({ data: null }, 201));
app.all("/api/v1/*", (c) =>
  problem(404, Problems.notFound, "Not found", "API route not found", c.req.path)
);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
