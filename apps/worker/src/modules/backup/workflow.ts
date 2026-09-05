import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Env } from "../../env";
import type { BackupParams as EnvBackupParams } from "../../env";
import { AuditWriter } from "../../platform/audit";
import { BackupRepository, type BackupRunRow } from "./repository";
import { BackupService } from "./service";

export type BackupParams = EnvBackupParams;

export class D1BackupWorkflow extends WorkflowEntrypoint<Env, BackupParams> {
  async run(event: WorkflowEvent<BackupParams>, step: WorkflowStep) {
    const requestedAt = event.schedule
      ? new Date(event.schedule.scheduledTime).toISOString()
      : event.payload?.requested_at ?? event.timestamp.toISOString();

    const service = new BackupService(
      new BackupRepository(this.env.DB),
      this.env.MEDIA,
      {
        accountId: this.env.CLOUDFLARE_ACCOUNT_ID ?? "",
        databaseId: this.env.D1_DATABASE_ID ?? "",
        token: this.env.D1_REST_API_TOKEN ?? ""
      }
    );

    // Step 1: create-run (guarded against concurrent duplicate runs)
    let run: BackupRunRow;
    try {
      run = await step.do("create-run", async () => {
        return service.createRun(requestedAt, event.instanceId);
      });
    } catch (err: any) {
      if (err?.message === "CONCURRENT_BACKUP_RUNNING") {
        return { status: "skipped", reason: "CONCURRENT_BACKUP_RUNNING" };
      }
      throw err;
    }

    try {
      // Step 2: start-export
      const init = await step.do(
        "start-export",
        { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } },
        async () => {
          return service.startExport();
        }
      );

      // Step 3: poll-export with exponential retry
      const ready = await step.do(
        "poll-export",
        { retries: { limit: 8, delay: "2 seconds", backoff: "exponential" } },
        async () => {
          if (init.signedUrl) return { signedUrl: init.signedUrl, bookmark: init.bookmark };
          return service.pollExport(init.bookmark);
        }
      );

      // Step 4: download-and-put
      const stored = await step.do(
        "download-and-put",
        { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } },
        async () => {
          return service.downloadAndPut(ready.signedUrl, requestedAt, event.instanceId);
        }
      );

      // Step 5: complete-run
      return await step.do("complete-run", async () => {
        const completed = await service.completeRun(run.id, {
          bookmark: ready.bookmark,
          key: stored.key,
          etag: stored.etag,
          sha256: stored.sha256,
          size: stored.size
        });
        try {
          await new AuditWriter(this.env.DB).append({
            actor: "system",
            action: "backup_complete",
            entity: "backup_run",
            entityId: run.id,
            requestId: event.instanceId,
            detail: {
              bookmark: ready.bookmark,
              key: stored.key,
              sha256: stored.sha256,
              size: stored.size
            },
            createdAt: Date.now()
          });
        } catch {}
        return completed;
      });
    } catch (error: any) {
      return await step.do("fail-run", async () => {
        const failed = await service.failRun(run.id, error?.message?.slice(0, 80) || "WORKFLOW_FAILED");
        try {
          await new AuditWriter(this.env.DB).append({
            actor: "system",
            action: "backup_fail",
            entity: "backup_run",
            entityId: run?.id ?? event.instanceId,
            requestId: event.instanceId,
            detail: {
              error: error?.message?.slice(0, 80) || "WORKFLOW_FAILED"
            },
            createdAt: Date.now()
          });
        } catch {}
        return failed;
      });
    }
  }
}

