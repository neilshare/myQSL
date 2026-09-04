import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index].replace(/^--/u, ""), process.argv[index + 1] ?? "");
const sqlPath = args.get("sql"); const database = args.get("database");
if (!sqlPath || !database) throw new Error("Usage: verify-backup.mts --sql <file> --database <name>");

const sql = readFileSync(sqlPath, "utf8");
const tables = ["app_settings", "audit_events", "backup_runs", "card_templates", "import_chunks", "import_jobs", "qsl_cards", "qsos", "stations"];
for (const table of tables) if (!new RegExp(`CREATE TABLE\\s+${table}\\b`, "iu").test(sql)) throw new Error(`Missing table ${table}`);

// Execute SQL in an ephemeral in-memory SQLite database to verify valid SQL syntax and table creation
const db = new DatabaseSync(":memory:");
db.exec(sql);

// Verify that each of the 9 tables exists in sqlite_master and can be queried
for (const table of tables) {
  const check = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?").get(table) as { count: number };
  if (!check || check.count === 0) {
    throw new Error(`Restoration verification failed: Table ${table} was not created in database`);
  }
  db.prepare(`SELECT * FROM ${table} LIMIT 1`).all();
}

const digest = createHash("sha256").update(sql).digest("hex");
console.log(`RESTORE_VERIFIED tables=${tables.length} sha256=${digest}`);

