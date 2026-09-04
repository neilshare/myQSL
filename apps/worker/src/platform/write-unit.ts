import type { AuditEventInput } from "./audit";
import { buildAuditStatement } from "./audit";

export async function executeBatchWithAudit(
  db: D1Database,
  statements: D1PreparedStatement[],
  auditEvent: AuditEventInput
): Promise<D1Result<unknown>[]> {
  const auditStmt = buildAuditStatement(db, auditEvent);
  return db.batch([...statements, auditStmt]);
}
