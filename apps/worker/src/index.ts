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
import type { RequestVariables } from "./platform/request-context";
import { registerIntegrationRoutes } from "./modules/integrations/routes";
import { registerIngestRoutes } from "./modules/ingest/routes";
import { registerPrintingRoutes } from "./modules/printing/routes";
import { registerDeliveryRoutes } from "./modules/deliveries/routes";
import { registerCardBatchRoutes } from "./modules/cards/batch-routes";
import { DeliveryDispatcher } from "./modules/deliveries/dispatcher";

const app = new Hono<{ Bindings: Env; Variables: RequestVariables }>();

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
  if (c.req.path.startsWith("/api/v1/agent/")) {
    return next();
  }
  if (c.req.path.startsWith("/api/v1/webhooks/")) {
    return next();
  }
  return requireOwner(c, next);
});
app.use("/api/v1/agent/*", async (c, next) => {
  if (c.env.FEATURE_AGENT_INGEST === "0") return problem(404, "https://myqsl.app/problems/feature-disabled", "Feature disabled", "Agent ingest is disabled", c.req.path);
  return next();
});
registerIngestRoutes(app);
app.use("/api/v1/integrations/agents", requireSameOrigin);
app.use("/api/v1/integrations/agents", requireOwner);
app.use("/api/v1/integrations/agents/*", requireSameOrigin);
app.use("/api/v1/integrations/agents/*", requireOwner);
registerIntegrationRoutes(app);
app.use("/api/v1/print-batches", requireSameOrigin);
app.use("/api/v1/print-batches/*", requireSameOrigin);
app.use("/api/v1/print-batches*", async (c, next) => {
  if (c.env.FEATURE_PRINT === "0") return problem(404, "https://myqsl.app/problems/feature-disabled", "Feature disabled", "Printing is disabled", c.req.path);
  return next();
});
registerPrintingRoutes(app);
app.use("/api/v1/delivery-batches", requireSameOrigin);
app.use("/api/v1/delivery-batches/*", requireSameOrigin);
app.use("/api/v1/delivery-settings/*", requireSameOrigin);
app.use("/api/v1/delivery-batches*", async (c, next) => {
  if (c.env.FEATURE_EMAIL_DELIVERY === "0") return problem(404, "https://myqsl.app/problems/feature-disabled", "Feature disabled", "Email delivery is disabled", c.req.path);
  return next();
});
registerDeliveryRoutes(app);
registerStationRoutes(app);
registerQsoRoutes(app);
registerImportRoutes(app);
registerTemplateRoutes(app);
app.use("/api/v1/cards", requireSameOrigin);
app.use("/api/v1/cards", requireOwner);
registerCardRoutes(app);
app.use("/api/v1/card-batches", requireSameOrigin);
app.use("/api/v1/card-batches/*", requireSameOrigin);
registerCardBatchRoutes(app);
app.use("/api/v1/backups", requireSameOrigin);
app.use("/api/v1/backups", requireOwner);
registerBackupRoutes(app);
app.all("/api/v1/*", (c) =>
  problem(404, Problems.notFound, "Not found", "API route not found", c.req.path)
);

app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const pathname = new URL(c.req.url).pathname;
  if (pathname === "/" || pathname === "/index.html" || pathname === "/sw.js" || pathname.endsWith(".html")) {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers
    });
  }
  return res;
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    if (controller.cron !== "0 20 * * *") {
      ctx.waitUntil(new DeliveryDispatcher(env).dispatchDue(50));
      return;
    }
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
