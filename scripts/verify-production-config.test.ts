import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { validateProductionConfig } from "./verify-production-config.mts";

describe("validateProductionConfig", () => {
  const validTarget = {
    appEnv: "production",
    publicOrigin: "https://eqsr.ham.radio",
    accessTeamDomain: "https://myqsl.cloudflareaccess.com",
    accessAud: "myqsl-production-audience",
    testAuthEnabled: "0",
    d1DatabaseId: "12345678-1234-1234-1234-123456789abc",
    existingSecrets: ["D1_REST_API_TOKEN", "RATE_LIMIT_SALT"]
  };

  it("passes when all production requirements are met", () => {
    const result = validateProductionConfig(validTarget);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects non-production or missing APP_ENV", () => {
    const invalidEnv = validateProductionConfig({ ...validTarget, appEnv: "local" });
    expect(invalidEnv.valid).toBe(false);
    expect(invalidEnv.issues.some((i) => i.field === "APP_ENV")).toBe(true);

    const missingEnv = validateProductionConfig({ ...validTarget, appEnv: undefined });
    expect(missingEnv.valid).toBe(false);
    expect(missingEnv.issues.some((i) => i.field === "APP_ENV")).toBe(true);
  });

  it("rejects non-HTTPS or localhost PUBLIC_ORIGIN", () => {
    const httpOrigin = validateProductionConfig({ ...validTarget, publicOrigin: "http://eqsr.ham.radio" });
    expect(httpOrigin.valid).toBe(false);
    expect(httpOrigin.issues.some((i) => i.field === "PUBLIC_ORIGIN")).toBe(true);

    const localOrigin = validateProductionConfig({ ...validTarget, publicOrigin: "https://localhost:8787" });
    expect(localOrigin.valid).toBe(false);
    expect(localOrigin.issues.some((i) => i.field === "PUBLIC_ORIGIN")).toBe(true);
  });

  it("rejects placeholder or invalid D1 database UUIDs", () => {
    const placeholderD1 = validateProductionConfig({
      ...validTarget,
      d1DatabaseId: "00000000-0000-0000-0000-000000000001"
    });
    expect(placeholderD1.valid).toBe(false);
    expect(placeholderD1.issues.some((i) => i.field === "D1_DATABASE_ID")).toBe(true);

    const malformedD1 = validateProductionConfig({
      ...validTarget,
      d1DatabaseId: "not-a-valid-uuid"
    });
    expect(malformedD1.valid).toBe(false);
    expect(malformedD1.issues.some((i) => i.field === "D1_DATABASE_ID")).toBe(true);
  });

  it("rejects mismatched D1 backup database ID", () => {
    const mismatched = validateProductionConfig({
      ...validTarget,
      backupDatabaseId: "87654321-4321-4321-4321-cba987654321"
    });
    expect(mismatched.valid).toBe(false);
    expect(mismatched.issues.some((i) => i.field === "D1_BACKUP_DATABASE_ID")).toBe(true);

    const matched = validateProductionConfig({
      ...validTarget,
      backupDatabaseId: validTarget.d1DatabaseId
    });
    expect(matched.valid).toBe(true);
  });

  it("rejects enabled test auth in production", () => {
    const testAuthOn = validateProductionConfig({
      ...validTarget,
      testAuthEnabled: "1"
    });
    expect(testAuthOn.valid).toBe(false);
    expect(testAuthOn.issues.some((i) => i.field === "TEST_AUTH_ENABLED")).toBe(true);
  });

  it("rejects when required production secrets are missing from remote list", () => {
    const missingSecret = validateProductionConfig({
      ...validTarget,
      existingSecrets: ["D1_REST_API_TOKEN"] // RATE_LIMIT_SALT missing
    });
    expect(missingSecret.valid).toBe(false);
    expect(missingSecret.issues.some((i) => i.field === "SECRET:RATE_LIMIT_SALT")).toBe(true);
  });

  it("rejects when existingSecrets is undefined in production (fail-closed)", () => {
    const undefinedSecrets = validateProductionConfig({
      ...validTarget,
      existingSecrets: undefined
    });
    expect(undefinedSecrets.valid).toBe(false);
    expect(undefinedSecrets.issues.some((i) => i.field === "SECRETS")).toBe(true);
  });

  it("rejects when existingSecrets is an empty array (fail-closed)", () => {
    const emptySecrets = validateProductionConfig({
      ...validTarget,
      existingSecrets: []
    });
    expect(emptySecrets.valid).toBe(false);
    expect(emptySecrets.issues.some((i) => i.field === "SECRET:D1_REST_API_TOKEN")).toBe(true);
    expect(emptySecrets.issues.some((i) => i.field === "SECRET:RATE_LIMIT_SALT")).toBe(true);
  });

  it("rejects missing required bindings", () => {
    const missingDb = validateProductionConfig({ ...validTarget, hasDbBinding: false });
    expect(missingDb.valid).toBe(false);
    expect(missingDb.issues.some((i) => i.field === "BINDING:DB")).toBe(true);

    const missingMedia = validateProductionConfig({ ...validTarget, hasMediaBinding: false });
    expect(missingMedia.valid).toBe(false);
    expect(missingMedia.issues.some((i) => i.field === "BINDING:MEDIA")).toBe(true);

    const missingRateLimiter = validateProductionConfig({ ...validTarget, hasRateLimiterBinding: false });
    expect(missingRateLimiter.valid).toBe(false);
    expect(missingRateLimiter.issues.some((i) => i.field === "BINDING:PUBLIC_RATE_LIMITER")).toBe(true);

    const missingWorkflow = validateProductionConfig({ ...validTarget, hasBackupWorkflowBinding: false });
    expect(missingWorkflow.valid).toBe(false);
    expect(missingWorkflow.issues.some((i) => i.field === "BINDING:D1_BACKUP_WORKFLOW")).toBe(true);
  });

  it("rejects missing, invalid or placeholder ACCESS configuration", () => {
    const missingAccessDomain = validateProductionConfig({
      ...validTarget,
      accessTeamDomain: undefined
    });
    expect(missingAccessDomain.valid).toBe(false);
    expect(missingAccessDomain.issues.some((i) => i.field === "ACCESS_TEAM_DOMAIN")).toBe(true);

    const invalidAccessUrl = validateProductionConfig({
      ...validTarget,
      accessTeamDomain: "http://myqsl.cloudflareaccess.com"
    });
    expect(invalidAccessUrl.valid).toBe(false);
    expect(invalidAccessUrl.issues.some((i) => i.field === "ACCESS_TEAM_DOMAIN")).toBe(true);

    const missingAud = validateProductionConfig({
      ...validTarget,
      accessAud: undefined
    });
    expect(missingAud.valid).toBe(false);
    expect(missingAud.issues.some((i) => i.field === "ACCESS_AUD")).toBe(true);

    const placeholderAud = validateProductionConfig({
      ...validTarget,
      accessAud: "local-development-audience"
    });
    expect(placeholderAud.valid).toBe(false);
    expect(placeholderAud.issues.some((i) => i.field === "ACCESS_AUD")).toBe(true);
  });
});

describe("verify-production-config CLI", () => {
  const scriptPath = resolve(process.cwd(), "scripts/verify-production-config.mts");

  it("exits with 0 in --dry-run mode without --strict", () => {
    const output = execFileSync(
      "node",
      ["--import", "tsx", scriptPath, "--dry-run", "--skip-secrets"],
      { encoding: "utf8" }
    );
    expect(output).toContain("Dry run mode enabled");
  });

  it("fails and exits non-zero if --strict and --dry-run are combined", () => {
    expect(() => {
      execFileSync(
        "node",
        ["--import", "tsx", scriptPath, "--strict", "--dry-run"],
        { encoding: "utf8", stdio: "pipe" }
      );
    }).toThrow();
  });

  it("fails and exits non-zero if --strict and --skip-secrets are combined", () => {
    expect(() => {
      execFileSync(
        "node",
        ["--import", "tsx", scriptPath, "--strict", "--skip-secrets"],
        { encoding: "utf8", stdio: "pipe" }
      );
    }).toThrow();
  });

  it("fails and exits non-zero if --strict and SKIP_REMOTE_SECRETS=1 are combined", () => {
    expect(() => {
      execFileSync(
        "node",
        ["--import", "tsx", scriptPath, "--strict"],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, SKIP_REMOTE_SECRETS: "1" }
        }
      );
    }).toThrow();
  });

  it("fails when wrangler.jsonc contains placeholder D1 ID even if process.env.D1_DATABASE_ID is valid", () => {
    expect(() => {
      execFileSync(
        "node",
        ["--import", "tsx", scriptPath, "--skip-secrets"],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            D1_DATABASE_ID: "12345678-1234-1234-1234-123456789abc"
          }
        }
      );
    }).toThrow();
  });
});
