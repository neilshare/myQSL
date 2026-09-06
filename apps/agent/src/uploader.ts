import type { IngestReceipt } from "@myqsl/domain";
import { Outbox, type OutboxItem } from "./outbox";

export type UploaderConfig = { origin: string; device_token: string; access_client_id: string; access_client_secret: string; timeout_ms?: number };
export class AgentAuthError extends Error {}
export class AgentRetryableError extends Error { constructor(readonly retryAfterMs: number, message: string) { super(message); } }

export class Uploader {
  private paused = false;
  constructor(private readonly outbox: Outbox, private readonly config: UploaderConfig) {}
  get isPaused(): boolean { return this.paused; }

  async flush(now = Date.now(), limit = 2): Promise<{ attempted: number; acked: number; retried: number }> {
    const items = this.outbox.claimDue(now, limit);
    let acked = 0; let retried = 0;
    for (const item of items) {
      try { await this.send(item); acked += 1; }
      catch (error) {
        if (error instanceof AgentAuthError) { this.paused = true; this.outbox.retry(item.event_id, now + 5 * 60_000, error.message); continue; }
        const retryAt = now + (error instanceof AgentRetryableError ? error.retryAfterMs : Math.min(300_000, 1000 * 2 ** Math.min(item.attempt_count, 8)) + Math.floor(Math.random() * 1000));
        this.outbox.retry(item.event_id, retryAt, error instanceof Error ? error.message : "upload failed"); retried += 1;
      }
    }
    return { attempted: items.length, acked, retried };
  }

  resume(): void { this.paused = false; }

  private async send(item: OutboxItem): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout_ms ?? 10_000);
    try {
      const response = await fetch(new URL("/api/v1/agent/events", this.config.origin), { method: "POST", redirect: "error", signal: controller.signal, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.config.device_token}`, "CF-Access-Client-Id": this.config.access_client_id, "CF-Access-Client-Secret": this.config.access_client_secret }, body: JSON.stringify(item.payload) });
      if (response.status === 401 || response.status === 403) throw new AgentAuthError(`agent authentication rejected (${response.status})`);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        throw new AgentRetryableError(Math.max(1000, Math.min(300_000, retryAfter * 1000)), "agent ingest rate limited");
      }
      if (response.status >= 500) throw new AgentRetryableError(5000, `agent ingest server error (${response.status})`);
      if (!response.ok) throw new Error(`agent ingest rejected (${response.status})`);
      const body = await response.json() as { data?: IngestReceipt };
      if (!body.data || body.data.event_id !== item.event_id) throw new Error("agent ingest response is missing a matching receipt");
      this.outbox.ack(item.event_id, body.data);
    } finally { clearTimeout(timer); }
  }
}
