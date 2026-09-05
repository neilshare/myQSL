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

export function sanitizeAuditDetail(detail: Record<string, unknown> = {}): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (/token|secret|password|auth|private_key/i.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditDetail(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function buildAuditStatement(db: D1Database, event: AuditEventInput): D1PreparedStatement {
  const detailJson = JSON.stringify(sanitizeAuditDetail(event.detail ?? {}));
  return db
    .prepare(
      "INSERT INTO audit_events (actor, action, entity, entity_id, request_id, detail_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      event.actor,
      event.action,
      event.entity,
      event.entityId ?? null,
      event.requestId,
      detailJson,
      event.ipHash ?? null,
      event.createdAt
    );
}

export function buildConditionalAuditStatement(db: D1Database, event: AuditEventInput): D1PreparedStatement {
  const detailJson = JSON.stringify(sanitizeAuditDetail(event.detail ?? {}));
  return db
    .prepare(
      "INSERT INTO audit_events (actor, action, entity, entity_id, request_id, detail_json, ip_hash, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT changes()) > 0"
    )
    .bind(
      event.actor,
      event.action,
      event.entity,
      event.entityId ?? null,
      event.requestId,
      detailJson,
      event.ipHash ?? null,
      event.createdAt
    );
}

export class AuditWriter {
  constructor(private readonly db: D1Database) {}

  buildStatement(event: AuditEventInput): D1PreparedStatement {
    return buildAuditStatement(this.db, event);
  }

  buildConditionalStatement(event: AuditEventInput): D1PreparedStatement {
    return buildConditionalAuditStatement(this.db, event);
  }

  async append(event: AuditEventInput): Promise<void> {
    await this.buildStatement(event).run();
  }
}
