import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Env } from "../../env";
import { BackupRepository } from "./repository";
import { BackupService } from "./service";

export type BackupParams = { requested_at?: string };
export class D1BackupWorkflow extends WorkflowEntrypoint<Env, BackupParams> {
  async run(event: WorkflowEvent<BackupParams>, step: WorkflowStep) {
    const requestedAt = event.schedule ? new Date(event.schedule.scheduledTime).toISOString() : event.payload?.requested_at ?? event.timestamp.toISOString();
    return step.do("export D1 to R2", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } }, () => new BackupService(new BackupRepository(this.env.DB), this.env.MEDIA, { accountId: this.env.CLOUDFLARE_ACCOUNT_ID ?? "", databaseId: this.env.D1_DATABASE_ID ?? "", token: this.env.D1_REST_API_TOKEN ?? "" }).run(requestedAt, event.instanceId));
  }
}
