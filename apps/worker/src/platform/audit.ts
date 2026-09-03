import type { AppDatabase } from "./db";
import { auditEvents } from "./schema";

export interface AuditEventInput {
  actor: string;
  action: string;
  entity: string;
  entityId?: string;
  requestId: string;
  detail?: Record<string, unknown>;
  ipHash?: string;
  createdAt: number;
}

export class AuditWriter {
  constructor(private readonly db: AppDatabase) {}

  async append(event: AuditEventInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      actor: event.actor,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      requestId: event.requestId,
      detailJson: JSON.stringify(event.detail ?? {}),
      ipHash: event.ipHash,
      createdAt: event.createdAt
    });
  }
}
