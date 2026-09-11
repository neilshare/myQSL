import type { Env } from "../../env";
import { DeliveryDispatcher } from "./dispatcher";
import { DeliveryService } from "./service";
import { repairWebhookOrphans } from "./webhook";

const MAX_ATTEMPTS = 8;
const MAX_WINDOW_MS = 23 * 60 * 60 * 1000;

export class DeliveryScheduler {
  constructor(private readonly env: Env, private readonly now: () => number = Date.now) {}

  /** Recover interrupted sends before a new workflow/cron dispatch. */
  async recover(): Promise<{ recovered: number; expired: number }> {
    const now = this.now();
    const rows = await this.env.DB.prepare(
      "SELECT id,status,created_at,attempt_count FROM card_deliveries WHERE send_confirmed=1 AND ((status='sending' AND lease_until IS NOT NULL AND lease_until <= ?) OR (status IN ('queued','retry_wait') AND created_at <= ?))"
    ).bind(now, now - MAX_WINDOW_MS).all<{ id: string; status: string; created_at: number; attempt_count: number }>();
    let recovered = 0;
    let expired = 0;
    for (const row of rows.results) {
      const ageExceeded = now - Number(row.created_at) >= MAX_WINDOW_MS;
      const attemptsExceeded = Number(row.attempt_count) >= MAX_ATTEMPTS;
      if (ageExceeded) {
        await this.env.DB.prepare(
          "UPDATE card_deliveries SET status='unknown',reason='DELIVERY_WINDOW_EXPIRED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND send_confirmed=1 AND ((status='sending' AND lease_until IS NOT NULL AND lease_until <= ?) OR (status IN ('queued','retry_wait') AND created_at <= ?))"
        ).bind(now, row.id, now, now - MAX_WINDOW_MS).run();
        expired += 1;
      } else if (attemptsExceeded) {
        await this.env.DB.prepare(
          "UPDATE card_deliveries SET status='unknown',reason='RETRY_LIMIT_EXCEEDED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status='sending' AND lease_until <= ?"
        ).bind(now, row.id, now).run();
        expired += 1;
      } else {
        await this.env.DB.prepare(
          "UPDATE card_deliveries SET status='retry_wait',reason='LEASE_EXPIRED',next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status='sending' AND lease_until <= ?"
        ).bind(now, now, row.id, now).run();
        recovered += 1;
      }
    }
    return { recovered, expired };
  }

  /** Recover abandoned preparation and hand due deliveries to Workflows. */
  async scheduleDue(limit = 50): Promise<{ scheduled: number; recovered: number; expired: number; prepared: number; repaired: number }> {
    const recovery = await this.recover();
    const { repaired } = await repairWebhookOrphans(this.env, this.now(), 100);
    const preparing = await this.env.DB.prepare("SELECT id FROM delivery_batches WHERE status='preparing' ORDER BY created_at LIMIT ?").bind(Math.min(limit, 10)).all<{ id: string }>();
    for (const batch of preparing.results) {
      try { await new DeliveryService(this.env, this.now).prepare(batch.id); } catch (error) { console.error("Failed to recover delivery preparation", error); }
    }

    const due = await this.env.DB.prepare("SELECT id FROM card_deliveries WHERE send_confirmed=1 AND status IN ('queued','retry_wait') AND next_attempt_at <= ? ORDER BY created_at LIMIT ?").bind(this.now(), limit).all<{ id: string }>();
    if (this.env.EMAIL_DISPATCH_WORKFLOW) {
      let scheduled = 0;
      for (const row of due.results) {
        try { await this.env.EMAIL_DISPATCH_WORKFLOW.create({ params: { delivery_id: row.id } }); scheduled += 1; } catch (error) { console.error("Failed to create email dispatch workflow", error); }
      }
      return { ...recovery, prepared: preparing.results.length, repaired, scheduled };
    }
    const dispatched = await new DeliveryDispatcher(this.env, this.now).dispatchDue(limit);
    return { ...recovery, prepared: preparing.results.length, repaired, scheduled: dispatched.submitted + dispatched.retry + dispatched.unknown + dispatched.cancelled };
  }
}
