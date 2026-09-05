import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface BackupManifestSample {
  table: string;
  id: number | string;
  expected_sha256: string;
}

export interface BackupManifest {
  backup_id: string;
  schema_version: string;
  sql_sha256: string;
  canonical_version: string;
  expected_counts: Record<string, number>;
  sample_hashes: BackupManifestSample[];
}

export interface VerificationEvidence {
  verified: boolean;
  backupId?: string;
  schemaVersion?: string;
  sqlSha256: string;
  tablesVerified: number;
  expectedCounts?: Record<string, number>;
  actualCounts?: Record<string, number>;
  sampleVerifications?: Array<{
    table: string;
    id: number | string;
    expectedHash: string;
    actualHash: string;
    matched: boolean;
  }>;
}

export function canonicalRowHash(row: Record<string, unknown>): string {
  const sortedKeys = Object.keys(row).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const val = row[key];
    if (val === undefined || val === null) {
      normalized[key] = null;
    } else if (typeof val === "bigint") {
      normalized[key] = Number(val);
    } else if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
      normalized[key] = Buffer.from(val).toString("hex");
    } else {
      normalized[key] = val;
    }
  }
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function verifyBackupDump(options: {
  sql: string;
  manifest?: BackupManifest | null;
  databaseName?: string;
}): VerificationEvidence {
  const { sql, manifest } = options;
  const sqlSha256 = createHash("sha256").update(sql).digest("hex");

  if (manifest?.sql_sha256 && sqlSha256 !== manifest.sql_sha256) {
    throw new Error(`SQL_CHECKSUM_MISMATCH: expected ${manifest.sql_sha256}, got ${sqlSha256}`);
  }

  const tablesToCheck = manifest?.expected_counts
    ? Object.keys(manifest.expected_counts)
    : [
        "app_settings",
        "audit_events",
        "backup_runs",
        "card_templates",
        "import_chunks",
        "import_jobs",
        "qsl_cards",
        "qsos",
        "stations"
      ];

  for (const table of tablesToCheck) {
    if (!new RegExp(`CREATE TABLE\\s+${table}\\b`, "iu").test(sql)) {
      throw new Error(`SCHEMA_VERIFICATION_FAILED: Missing CREATE TABLE statement for ${table}`);
    }
  }

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sql);
  } catch (err: any) {
    throw new Error(`SQL_SYNTAX_ERROR: ${err.message}`);
  }

  for (const table of tablesToCheck) {
    const check = db
      .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?")
      .get(table) as { count: number } | undefined;
    if (!check || check.count === 0) {
      throw new Error(`TABLE_MISSING_IN_DB: Table ${table} was not created in database`);
    }
    db.prepare(`SELECT * FROM ${table} LIMIT 1`).all();
  }

  const actualCounts: Record<string, number> = {};
  const sampleVerifications: VerificationEvidence["sampleVerifications"] = [];

  if (manifest) {
    for (const [table, expectedCount] of Object.entries(manifest.expected_counts)) {
      const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as { count: number };
      const actualCount = row.count;
      actualCounts[table] = actualCount;
      if (actualCount !== expectedCount) {
        throw new Error(
          `ROW_COUNT_MISMATCH: Table ${table} expected ${expectedCount} rows, but restored ${actualCount} rows`
        );
      }
    }

    for (const sample of manifest.sample_hashes) {
      const sampleRow = db.prepare(`SELECT * FROM ${sample.table} WHERE id = ?`).get(sample.id) as
        | Record<string, unknown>
        | undefined;
      if (!sampleRow) {
        throw new Error(`SAMPLE_ROW_MISSING: Table ${sample.table} row id=${sample.id} not found`);
      }
      const actualHash = canonicalRowHash(sampleRow);
      const matched = actualHash === sample.expected_sha256;
      sampleVerifications.push({
        table: sample.table,
        id: sample.id,
        expectedHash: sample.expected_sha256,
        actualHash,
        matched
      });
      if (!matched) {
        throw new Error(
          `SAMPLE_HASH_MISMATCH: Table ${sample.table} row id=${sample.id} expected hash ${sample.expected_sha256}, got ${actualHash}`
        );
      }
    }
  }

  return {
    verified: true,
    backupId: manifest?.backup_id,
    schemaVersion: manifest?.schema_version,
    sqlSha256,
    tablesVerified: tablesToCheck.length,
    expectedCounts: manifest?.expected_counts,
    actualCounts,
    sampleVerifications
  };
}

function runCli() {
  const args = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index].replace(/^--/u, ""), process.argv[index + 1] ?? "");
  }
  const sqlPath = args.get("sql");
  const database = args.get("database");
  if (!sqlPath || !database) {
    throw new Error("Usage: verify-backup.mts --sql <file> --database <name> [--manifest <manifest.json>]");
  }

  let manifestPath = args.get("manifest");
  if (!manifestPath) {
    const candidate = sqlPath.replace(/\.sql$/u, ".manifest.json");
    if (existsSync(candidate)) {
      manifestPath = candidate;
    }
  }

  const sql = readFileSync(sqlPath, "utf8");
  let manifest: BackupManifest | null = null;
  if (manifestPath && existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest;
  }

  const evidence = verifyBackupDump({ sql, manifest, databaseName: database });
  const countsMatched = Object.keys(evidence.actualCounts ?? {}).length;
  const samplesVerified = evidence.sampleVerifications?.length ?? 0;

  console.log(
    `RESTORE_VERIFIED tables=${evidence.tablesVerified} backup_id=${evidence.backupId ?? "none"} sha256=${evidence.sqlSha256} counts_matched=${countsMatched} samples_verified=${samplesVerified}`
  );
}

if (process.argv[1]?.includes("verify-backup")) {
  runCli();
}


