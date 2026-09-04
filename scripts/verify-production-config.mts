import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface ProductionConfigTarget {
  appEnv?: string;
  publicOrigin?: string;
  testAuthEnabled?: string;
  d1DatabaseId?: string;
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
  "ACCESS_AUD",
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

  // 3. D1 database_id check (no placeholder UUID)
  if (!target.d1DatabaseId) {
    issues.push({ field: "D1_DATABASE_ID", message: "D1 database_id is required", severity: "error" });
  } else if (DUMMY_UUID_PATTERN.test(target.d1DatabaseId) || target.d1DatabaseId.startsWith("00000000-")) {
    issues.push({ field: "D1_DATABASE_ID", message: `D1 database_id contains placeholder UUID '${target.d1DatabaseId}'`, severity: "error" });
  } else if (!UUID_PATTERN.test(target.d1DatabaseId)) {
    issues.push({ field: "D1_DATABASE_ID", message: `D1 database_id is not a valid UUID: '${target.d1DatabaseId}'`, severity: "error" });
  }

  // 4. TEST_AUTH_ENABLED check
  if (target.testAuthEnabled === "1") {
    issues.push({ field: "TEST_AUTH_ENABLED", message: "TEST_AUTH_ENABLED must be '0' or unset in production", severity: "error" });
  }

  // 5. Secrets check (if secret list provided)
  const required = target.requiredSecrets ?? DEFAULT_REQUIRED_SECRETS;
  if (target.existingSecrets && target.existingSecrets.length > 0) {
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

  console.log("🔍 Checking eQSR production deployment preflight configuration...");

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

  const prodEnv = wrangler.env?.production ?? {};
  const prodVars = { ...wrangler.vars, ...prodEnv.vars };
  const prodD1 = prodEnv.d1_databases?.[0] ?? wrangler.d1_databases?.[0];

  const target: ProductionConfigTarget = {
    appEnv: process.env.APP_ENV ?? prodVars.APP_ENV,
    publicOrigin: process.env.PUBLIC_ORIGIN ?? prodVars.PUBLIC_ORIGIN,
    testAuthEnabled: process.env.TEST_AUTH_ENABLED ?? prodVars.TEST_AUTH_ENABLED,
    d1DatabaseId: process.env.D1_DATABASE_ID ?? prodD1?.database_id,
    requiredSecrets: DEFAULT_REQUIRED_SECRETS
  };

  const remoteSecrets = skipSecrets ? null : fetchRemoteSecrets();
  if (remoteSecrets) {
    target.existingSecrets = remoteSecrets;
    console.log(`🔐 Found ${remoteSecrets.length} remote secret(s) in Cloudflare.`);
  } else if (skipSecrets) {
    console.log("ℹ️ Remote secrets check explicitly skipped via flag or SKIP_REMOTE_SECRETS.");
  } else {
    console.log("ℹ️ Remote secrets could not be retrieved via wrangler CLI (offline or no token). Skipping remote secret existence validation.");
  }

  const result = validateProductionConfig(target);

  console.log("\n📋 Preflight Checklist Summary:");
  console.log(`  - Environment: ${target.appEnv ?? "unset"}`);
  console.log(`  - Public Origin: ${target.publicOrigin ?? "unset"}`);
  console.log(`  - D1 Database ID: ${target.d1DatabaseId ?? "unset"}`);
  console.log(`  - Test Auth Disabled: ${target.testAuthEnabled !== "1"}`);

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
      console.log("\n⚠️ Dry run mode enabled: Preflight completed with warnings (exiting 0).");
      process.exit(0);
    }
    if (!isStrict && target.appEnv !== "production") {
      console.log("\nℹ️ Current target is not production (set APP_ENV=production or --strict to enforce).");
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
