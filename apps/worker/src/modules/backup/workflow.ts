import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Env } from "../../env";
import type { BackupParams as EnvBackupParams } from "../../env";
import { BackupRepository } from "./repository";
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

    // Step 1: create-run
    const run = await step.do("create-run", async () => {
      return service.createRun(requestedAt, event.instanceId);
    });

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
        return service.completeRun(run.id, {
          bookmark: ready.bookmark,
          key: stored.key,
          etag: stored.etag,
          size: stored.size
        });
      });
    } catch (error: any) {
      return await step.do("fail-run", async () => {
        return service.failRun(run.id, error?.message?.slice(0, 80) || "WORKFLOW_FAILED");
      });
    }
  }
}

