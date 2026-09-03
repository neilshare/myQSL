import type { Hono } from "hono";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { problem } from "../../platform/problem";
import { BackupRepository } from "./repository";
import { BackupService } from "./service";

export function registerBackupRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.post("/api/v1/backups/run", async (c) => {
    if (!c.env.D1_BACKUP_WORKFLOW) return problem(503, "https://eqsr.app/problems/backup-unavailable", "Backup unavailable", "Workflow binding is not configured", c.req.path);
    try { const handle = await c.env.D1_BACKUP_WORKFLOW.create({ params: { requested_at: new Date().toISOString() } }); return c.json({ data: { instance_id: handle.id } }, 202); }
    catch { return problem(409, "https://eqsr.app/problems/backup-conflict", "Backup already running", "A backup workflow is already active", c.req.path); }
  });
  app.get("/api/v1/backups/latest", async (c) => { const row = await new BackupRepository(c.env.DB).running(); return c.json({ data: row }); });
}
