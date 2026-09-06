import { Outbox } from "./outbox";
import type { ReceiverStats } from "./receiver";

export function diagnostics(outbox: Outbox, receiver?: ReceiverStats): Record<string, unknown> {
  return { outbox: outbox.stats(), receiver: receiver ?? null, generated_at: new Date().toISOString() };
}
