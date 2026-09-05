import type { Hono } from "hono";
import { nanoid } from "nanoid";
import type { Env } from "../../env";
import type { RequestVariables } from "../../platform/request-context";
import { AuditWriter } from "../../platform/audit";
import { problem } from "../../platform/problem";
import { BackupRepository } from "./repository";

export function registerBackupRoutes(app: Hono<{ Bindings: Env; Variables: RequestVariables }>): void {
  app.get("/api/v1/backups", async (c) => {
    const repo = new BackupRepository(c.env.DB);
    const runs = await repo.list(20);
    const latest = runs[0] ?? null;
    return c.json({ data: runs, latest });
  });

  app.get("/api/v1/backups/latest", async (c) => {
    const row = await new BackupRepository(c.env.DB).latest();
    return c.json({ data: row });
  });

  app.post("/api/v1/backups/run", async (c) => {
    if (!c.env.D1_BACKUP_WORKFLOW) {
      return problem(503, "https://myqsl.app/problems/backup-unavailable", "Backup unavailable", "Workflow binding is not configured", c.req.path);
    }
    const repo = new BackupRepository(c.env.DB);
    if (await repo.running()) {
      return problem(409, "https://myqsl.app/problems/backup-conflict", "Backup already running", "A backup workflow is already active", c.req.path);
    }
    try {
      const handle = await c.env.D1_BACKUP_WORKFLOW.create({ params: { requested_at: new Date().toISOString() } });
      const actor = c.get("actor") ?? "admin";
      try {
        const audit = new AuditWriter(c.env.DB);
        await audit.append({
          actor,
          action: "backup_trigger",
          entity: "backup_run",
          entityId: handle.id,
          requestId: c.get("requestId") ?? nanoid(12),
          detail: { instance_id: handle.id },
          createdAt: Date.now()
        });
      } catch {}
      return c.json({ data: { instance_id: handle.id } }, 202);
    } catch {
      return problem(409, "https://myqsl.app/problems/backup-conflict", "Backup already running", "A backup workflow is already active", c.req.path);
    }
  });
}

