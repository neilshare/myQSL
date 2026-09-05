import type { AuditEventInput } from "./audit";
import { buildAuditStatement, buildConditionalAuditStatement } from "./audit";

export interface BatchWithAuditOptions {
  conditional?: boolean;
}

export async function executeBatchWithAudit(
  db: D1Database,
  statements: D1PreparedStatement[],
  auditEvent: AuditEventInput,
  options: BatchWithAuditOptions = {}
): Promise<D1Result<unknown>[]> {
  const auditStmt = options.conditional
    ? buildConditionalAuditStatement(db, auditEvent)
    : buildAuditStatement(db, auditEvent);
  return db.batch([...statements, auditStmt]);
}

export async function executeDmlWithConditionalAudit(
  db: D1Database,
  dmlStatement: D1PreparedStatement,
  auditEvent: AuditEventInput
): Promise<{
  dmlResult: D1Result<unknown>;
  auditResult: D1Result<unknown>;
  changed: boolean;
}> {
  const auditStmt = buildConditionalAuditStatement(db, auditEvent);
  const results = await db.batch([dmlStatement, auditStmt]);
  const dmlResult = results[0] as D1Result<unknown>;
  const auditResult = results[1] as D1Result<unknown>;
  const changed = Boolean(dmlResult.meta?.changes && dmlResult.meta.changes > 0);
  return { dmlResult, auditResult, changed };
}

