import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface ProductionConfigTarget {
  appEnv?: string;
  publicOrigin?: string;
  accessTeamDomain?: string;
  accessAud?: string;
  testAuthEnabled?: string;
  d1DatabaseId?: string;
  backupDatabaseId?: string;
  hasDbBinding?: boolean;
  hasMediaBinding?: boolean;
  hasRateLimiterBinding?: boolean;
  hasBackupWorkflowBinding?: boolean;
  existingSecrets?: string[];
  requiredSecrets?: string[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export const DEFAULT_REQUIRED_SECRETS = [
  "D1_REST_API_TOKEN",
  "RATE_LIMIT_SALT"
];

const DUMMY_UUID_PATTERN = /^0{8}-0{4}-0{4}-0{4}-0{12}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateProductionConfig(target: ProductionConfigTarget): {
  valid: boolean;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];

  // 1. APP_ENV check
  if (!target.appEnv) {
    issues.push({ field: "APP_ENV", message: "APP_ENV is required and must be 'production'", severity: "error" });
  } else if (target.appEnv !== "production") {
    issues.push({ field: "APP_ENV", message: `APP_ENV must be 'production', received '${target.appEnv}'`, severity: "error" });
  }

  // 2. PUBLIC_ORIGIN check
  if (!target.publicOrigin) {
    issues.push({ field: "PUBLIC_ORIGIN", message: "PUBLIC_ORIGIN is required", severity: "error" });
  } else {
    try {
      const url = new URL(target.publicOrigin);
      if (url.protocol !== "https:") {
        issues.push({ field: "PUBLIC_ORIGIN", message: `PUBLIC_ORIGIN must use HTTPS protocol, received '${target.publicOrigin}'`, severity: "error" });
      }
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        issues.push({ field: "PUBLIC_ORIGIN", message: `PUBLIC_ORIGIN must not point to localhost in production`, severity: "error" });
      }
    } catch {
      issues.push({ field: "PUBLIC_ORIGIN", message: `PUBLIC_ORIGIN is not a valid URL: '${target.publicOrigin}'`, severity: "error" });
    }
  }

  // 3. ACCESS_TEAM_DOMAIN check (Required in production)
  if (!target.accessTeamDomain) {
    issues.push({ field: "ACCESS_TEAM_DOMAIN", message: "ACCESS_TEAM_DOMAIN is required in production", severity: "error" });
  } else {
    try {
      const url = new URL(target.accessTeamDomain);
      if (url.protocol !== "https:") {
        issues.push({ field: "ACCESS_TEAM_DOMAIN", message: `ACCESS_TEAM_DOMAIN must use HTTPS protocol, received '${target.accessTeamDomain}'`, severity: "error" });
      }
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        issues.push({ field: "ACCESS_TEAM_DOMAIN", message: "ACCESS_TEAM_DOMAIN must not point to localhost in production", severity: "error" });
      }
    } catch {
      issues.push({ field: "ACCESS_TEAM_DOMAIN", message: `ACCESS_TEAM_DOMAIN is not a valid URL: '${target.accessTeamDomain}'`, severity: "error" });
    }
  }

  // 4. ACCESS_AUD check (Required in production, non-empty, non-placeholder)
  if (!target.accessAud || target.accessAud === "local-development-audience") {
    issues.push({ field: "ACCESS_AUD", message: "ACCESS_AUD is required in production and must not be placeholder ('local-development-audience')", severity: "error" });
  }

  // 5. D1 database_id check (no placeholder UUID)
  if (!target.d1DatabaseId) {
    issues.push({ field: "D1_DATABASE_ID", message: "D1 database_id is required", severity: "error" });
  } else if (DUMMY_UUID_PATTERN.test(target.d1DatabaseId) || target.d1DatabaseId.startsWith("00000000-")) {
    issues.push({ field: "D1_DATABASE_ID", message: `D1 database_id contains placeholder UUID '${target.d1DatabaseId}'`, severity: "error" });
  } else if (!UUID_PATTERN.test(target.d1DatabaseId)) {
    issues.push({ field: "D1_DATABASE_ID", message: `D1 database_id is not a valid UUID: '${target.d1DatabaseId}'`, severity: "error" });
  }

  // 6. D1 backup database ID consistency check
  if (target.backupDatabaseId && target.d1DatabaseId && target.backupDatabaseId !== target.d1DatabaseId) {
    issues.push({
      field: "D1_BACKUP_DATABASE_ID",
      message: `D1 backup database ID '${target.backupDatabaseId}' does not match D1 binding database ID '${target.d1DatabaseId}'`,
      severity: "error"
    });
  }

  // 7. TEST_AUTH_ENABLED check
  if (target.testAuthEnabled === "1") {
    issues.push({ field: "TEST_AUTH_ENABLED", message: "TEST_AUTH_ENABLED must be '0' or unset in production", severity: "error" });
  }

  // 8. Core Bindings check (DB, MEDIA, PUBLIC_RATE_LIMITER, D1_BACKUP_WORKFLOW)
  if (target.hasDbBinding === false) {
    issues.push({ field: "BINDING:DB", message: "D1 database binding 'DB' is missing in production configuration", severity: "error" });
  }
  if (target.hasMediaBinding === false) {
    issues.push({ field: "BINDING:MEDIA", message: "R2 bucket binding 'MEDIA' is missing in production configuration", severity: "error" });
  }
  if (target.hasRateLimiterBinding === false) {
    issues.push({ field: "BINDING:PUBLIC_RATE_LIMITER", message: "Rate limiter binding 'PUBLIC_RATE_LIMITER' is missing in production configuration", severity: "error" });
  }
  if (target.hasBackupWorkflowBinding === false) {
    issues.push({ field: "BINDING:D1_BACKUP_WORKFLOW", message: "Workflow binding 'D1_BACKUP_WORKFLOW' is missing in production configuration", severity: "error" });
  }

  // 9. Secrets check (Fail-Closed: undefined or missing required secrets fail)
  if (target.existingSecrets === undefined) {
    if (target.appEnv === "production") {
      issues.push({
        field: "SECRETS",
        message: "Production secrets status is unknown or verification was skipped (fail-closed)",
        severity: "error"
      });
    }
  } else {
    const required = target.requiredSecrets ?? DEFAULT_REQUIRED_SECRETS;
    for (const secret of required) {
      if (!target.existingSecrets.includes(secret)) {
        issues.push({ field: `SECRET:${secret}`, message: `Required production secret '${secret}' is missing`, severity: "error" });
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { valid: !hasErrors, issues };
}

export function parseWranglerJsonc(raw: string): any {
  // Strip single-line and multi-line comments while preserving string literals (e.g. URLs)
  const stripped = raw
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")|(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)/g,
      (_match, str) => (str ? str : "")
    )
    .replace(/,\s*([\]}])/g, "$1");
  return JSON.parse(stripped);
}

export function fetchRemoteSecrets(timeoutMs = 3000): string[] | null {
  if (process.env.SKIP_REMOTE_SECRETS === "1") {
    return null;
  }
  try {
    const stdout = execSync("npx --no-install wrangler secret list", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: timeoutMs
    });
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => (typeof item === "string" ? item : item.name));
    }
  } catch {
    // If wrangler secret list fails (e.g. not authenticated remotely), return null
  }
  return null;
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const isStrict = args.includes("--strict") || process.env.VERIFY_STRICT === "1";
  const isDryRun = args.includes("--dry-run");
  const skipSecrets = args.includes("--skip-secrets") || process.env.SKIP_REMOTE_SECRETS === "1";

  if (isStrict) {
    if (isDryRun) {
      console.error("❌ Fatal: --dry-run is strictly prohibited when --strict mode is enabled.");
      process.exit(1);
    }
    if (skipSecrets) {
      console.error("❌ Fatal: Skipping secrets (--skip-secrets / SKIP_REMOTE_SECRETS) is strictly prohibited when --strict mode is enabled.");
      process.exit(1);
    }
  }

  console.log("🔍 Checking myQSL production deployment preflight configuration...");

  let wranglerRaw = "";
  try {
    wranglerRaw = await readFile("wrangler.jsonc", "utf-8");
  } catch (err) {
    console.error("❌ Failed to read wrangler.jsonc:", err);
    process.exit(1);
  }

  let wrangler: any;
  try {
    wrangler = parseWranglerJsonc(wranglerRaw);
  } catch (err) {
    console.error("❌ Failed to parse wrangler.jsonc:", err);
    process.exit(1);
  }

  if (wrangler.env?.production) {
    console.warn("⚠️ Warning: wrangler.jsonc contains a nested env.production block. Top-level configuration must be the production target to prevent binding inheritance failure.");
  }

  const vars = wrangler.vars ?? {};
  // Binding MUST be looked up by binding === "DB"
  const d1Binding = wrangler.d1_databases?.find((d: any) => d.binding === "DB");

  // Lock target configuration to wrangler.jsonc values; do not allow process.env to mask errors in wrangler.jsonc!
  const target: ProductionConfigTarget = {
    appEnv: vars.APP_ENV ?? process.env.APP_ENV,
    publicOrigin: vars.PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN,
    accessTeamDomain: vars.ACCESS_TEAM_DOMAIN ?? process.env.ACCESS_TEAM_DOMAIN,
    accessAud: vars.ACCESS_AUD ?? process.env.ACCESS_AUD,
    testAuthEnabled: vars.TEST_AUTH_ENABLED ?? process.env.TEST_AUTH_ENABLED,
    d1DatabaseId: d1Binding?.database_id,
    backupDatabaseId: process.env.D1_BACKUP_DATABASE_ID ?? process.env.D1_DATABASE_ID ?? d1Binding?.database_id,
    hasDbBinding: Boolean(d1Binding),
    hasMediaBinding: Boolean(wrangler.r2_buckets?.some((b: any) => b.binding === "MEDIA")),
    hasRateLimiterBinding: Boolean(wrangler.ratelimits?.some((r: any) => r.name === "PUBLIC_RATE_LIMITER")),
    hasBackupWorkflowBinding: Boolean(wrangler.workflows?.some((w: any) => w.binding === "D1_BACKUP_WORKFLOW")),
    requiredSecrets: DEFAULT_REQUIRED_SECRETS
  };

  if (skipSecrets) {
    console.log("ℹ️ Remote secrets check explicitly skipped via flag or SKIP_REMOTE_SECRETS.");
    target.existingSecrets = undefined;
  } else {
    const remoteSecrets = fetchRemoteSecrets();
    if (remoteSecrets !== null) {
      target.existingSecrets = remoteSecrets;
      console.log(`🔐 Found ${remoteSecrets.length} remote secret(s) in Cloudflare.`);
    } else {
      console.error("❌ Remote secrets could not be retrieved via wrangler CLI (fail-closed). Missing secrets will be enforced.");
      target.existingSecrets = [];
    }
  }

  const result = validateProductionConfig(target);

  console.log("\n📋 Preflight Checklist Summary:");
  console.log(`  - Environment: ${target.appEnv ?? "unset"}`);
  console.log(`  - Public Origin: ${target.publicOrigin ?? "unset"}`);
  console.log(`  - D1 Database ID: ${target.d1DatabaseId ?? "unset"}`);
  console.log(`  - Access Team Domain: ${target.accessTeamDomain ?? "unset"}`);
  console.log(`  - Access AUD: ${target.accessAud ?? "unset"}`);
  console.log(`  - Test Auth Disabled: ${target.testAuthEnabled !== "1"}`);
  console.log(`  - DB Binding: ${target.hasDbBinding ? "present" : "MISSING"}`);
  console.log(`  - Media Binding: ${target.hasMediaBinding ? "present" : "MISSING"}`);
  console.log(`  - Rate Limiter Binding: ${target.hasRateLimiterBinding ? "present" : "MISSING"}`);
  console.log(`  - Workflow Binding: ${target.hasBackupWorkflowBinding ? "present" : "MISSING"}`);

  if (result.issues.length > 0) {
    console.log("\n⚠️ Issues Identified:");
    for (const issue of result.issues) {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.field}: ${issue.message}`);
    }
  }

  if (result.valid) {
    console.log("\n✅ PRODUCTION_CONFIG_OK: All production preflight assertions passed!");
    process.exit(0);
  } else {
    if (isDryRun) {
      console.log("\n⚠️ Dry run mode enabled: Preflight completed with warnings (diagnostic only, exiting 0).");
      process.exit(0);
    }
    console.error("\n❌ Preflight verification failed. Aborting production deployment.");
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runCli().catch((err) => {
    console.error("Unexpected error during preflight verification:", err);
    process.exit(1);
  });
}
