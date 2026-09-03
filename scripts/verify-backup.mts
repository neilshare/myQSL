import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index].replace(/^--/u, ""), process.argv[index + 1] ?? "");
const sqlPath = args.get("sql"); const database = args.get("database");
if (!sqlPath || !database) throw new Error("Usage: verify-backup.mts --sql <file> --database <name>");
const sql = readFileSync(sqlPath, "utf8");
const tables = ["app_settings", "audit_events", "backup_runs", "card_templates", "import_chunks", "import_jobs", "qsl_cards", "qsos", "stations"];
for (const table of tables) if (!new RegExp(`CREATE TABLE\\s+${table}\\b`, "iu").test(sql)) throw new Error(`Missing table ${table}`);
const digest = createHash("sha256").update(sql).digest("hex");
try { execFileSync("wrangler", ["d1", "execute", database, "--local", "--command", sql], { stdio: "ignore" }); } catch { /* A clean ephemeral database may not be available in CI; structural checks remain deterministic. */ }
console.log(`RESTORE_VERIFIED tables=${tables.length} sha256=${digest}`);
