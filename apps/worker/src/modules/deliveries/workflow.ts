import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { EmailDispatchParams, Env } from "../../env";
import { DeliveryDispatcher } from "./dispatcher";

export class EmailDispatchWorkflow extends WorkflowEntrypoint<Env, EmailDispatchParams> {
  async run(event: WorkflowEvent<EmailDispatchParams>, step: WorkflowStep) {
    const deliveryId = event.payload?.delivery_id;
    if (!deliveryId) return { status: "skipped", reason: "MISSING_DELIVERY_ID" };
    return step.do(
      "dispatch-email",
      { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } },
      async () => new DeliveryDispatcher(this.env).dispatchOne(deliveryId)
    );
  }
}
