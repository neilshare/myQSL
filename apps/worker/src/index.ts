import { Hono } from "hono";
import type { Env } from "./env";
import { requireOwner } from "./platform/access";
import { requestContext } from "./platform/request-context";
import { requireSameOrigin } from "./platform/origin";
import { problem, Problems } from "./platform/problem";
import { registerStationRoutes } from "./modules/stations/routes";
import { registerQsoRoutes } from "./modules/qsos/routes";
import { registerImportRoutes } from "./modules/imports/routes";
import { registerTemplateRoutes } from "./modules/templates/routes";
import { registerCardRoutes } from "./modules/cards/routes";
import { registerPublicRoutes } from "./modules/public/routes";
import { D1BackupWorkflow } from "./modules/backup/workflow";
import { registerBackupRoutes } from "./modules/backup/routes";
import { securityHeaders } from "./platform/security-headers";

const app = new Hono<{ Bindings: Env; Variables: { requestId: string; actor: string } }>();

app.use("*", requestContext);
app.use("*", securityHeaders);

app.get("/healthz", (c) => c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" }));
app.get("/readyz", requireOwner, async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ status: "ready", d1: "connected" }, 200, { "Cache-Control": "no-store" });
  } catch {
    return c.json({ status: "not_ready", error: "Database unreachable" }, 503, { "Cache-Control": "no-store" });
  }
});

app.use("/api/v1/qsos", requireSameOrigin);
app.use("/api/v1/qsos", requireOwner);
app.use("/api/v1/stations", requireSameOrigin);
app.use("/api/v1/stations", requireOwner);
app.use("/api/v1/imports", requireSameOrigin);
app.use("/api/v1/imports", requireOwner);
app.use("/api/v1/card-templates", requireSameOrigin);
app.use("/api/v1/card-templates", requireOwner);
registerPublicRoutes(app);
app.use("/api/v1/*", async (c, next) => {
  if (c.req.path.startsWith("/api/v1/public/")) {
    return next();
  }
  return requireOwner(c, next);
});
registerStationRoutes(app);
registerQsoRoutes(app);
registerImportRoutes(app);
registerTemplateRoutes(app);
app.use("/api/v1/cards", requireSameOrigin);
app.use("/api/v1/cards", requireOwner);
registerCardRoutes(app);
app.use("/api/v1/backups", requireSameOrigin);
app.use("/api/v1/backups", requireOwner);
registerBackupRoutes(app);
app.all("/api/v1/*", (c) =>
  problem(404, Problems.notFound, "Not found", "API route not found", c.req.path)
);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    if (!env.D1_BACKUP_WORKFLOW) return;
    ctx.waitUntil(
      (async () => {
        try {
          const requestedAt = new Date(controller.scheduledTime).toISOString();
          await env.D1_BACKUP_WORKFLOW.create({
            params: { requested_at: requestedAt }
          });
        } catch (err) {
          console.error("Failed to trigger scheduled D1 backup workflow:", err);
        }
      })()
    );
  }
} satisfies ExportedHandler<Env>;

export { D1BackupWorkflow };

