import { Hono } from "hono";
import type { Env } from "./env";
import { requireOwner } from "./platform/access";
import { requestContext } from "./platform/request-context";
import { requireSameOrigin } from "./platform/origin";
import { enforcePublicLimit } from "./platform/rate-limit";
import { problem, Problems } from "./platform/problem";
import { registerStationRoutes } from "./modules/stations/routes";
import { registerQsoRoutes } from "./modules/qsos/routes";
import { registerImportRoutes } from "./modules/imports/routes";
import { registerTemplateRoutes } from "./modules/templates/routes";
import { registerCardRoutes } from "./modules/cards/routes";
import { registerPublicRoutes } from "./modules/public/routes";

const app = new Hono<{ Bindings: Env; Variables: { requestId: string; actor: string } }>();

app.use("*", requestContext);

app.get("/healthz", (c) => c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" }));

app.use("/api/v1/qsos", requireSameOrigin);
app.use("/api/v1/qsos", requireOwner);
app.use("/api/v1/stations", requireSameOrigin);
app.use("/api/v1/stations", requireOwner);
app.use("/api/v1/imports", requireSameOrigin);
app.use("/api/v1/imports", requireOwner);
app.use("/api/v1/templates", requireSameOrigin);
app.use("/api/v1/templates", requireOwner);
registerPublicRoutes(app);
app.use("/api/v1/*", requireOwner);
registerStationRoutes(app);
registerQsoRoutes(app);
registerImportRoutes(app);
registerTemplateRoutes(app);
app.use("/api/v1/cards", requireSameOrigin);
app.use("/api/v1/cards", requireOwner);
registerCardRoutes(app);
app.all("/api/v1/*", (c) =>
  problem(404, Problems.notFound, "Not found", "API route not found", c.req.path)
);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
