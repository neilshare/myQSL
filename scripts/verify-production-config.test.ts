import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { validateProductionConfig } from "./verify-production-config.mts";

describe("validateProductionConfig", () => {
  const validTarget = {
    appEnv: "production",
    publicOrigin: "https://eqsr.ham.radio",
    testAuthEnabled: "0",
    d1DatabaseId: "12345678-1234-1234-1234-123456789abc",
    existingSecrets: ["D1_REST_API_TOKEN", "ACCESS_AUD", "RATE_LIMIT_SALT"]
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
      existingSecrets: ["D1_REST_API_TOKEN"] // ACCESS_AUD & RATE_LIMIT_SALT missing
    });
    expect(missingSecret.valid).toBe(false);
    expect(missingSecret.issues.some((i) => i.field === "SECRET:ACCESS_AUD")).toBe(true);
    expect(missingSecret.issues.some((i) => i.field === "SECRET:RATE_LIMIT_SALT")).toBe(true);
  });
});

describe("verify-production-config CLI", () => {
  const scriptPath = resolve(process.cwd(), "scripts/verify-production-config.mts");

  it("exits with 0 in --dry-run mode even with unconfigured values", () => {
    const output = execFileSync(
      "node",
      ["--import", "tsx", scriptPath, "--dry-run", "--skip-secrets"],
      { encoding: "utf8" }
    );
    expect(output).toContain("Dry run mode enabled");
  });

  it("exits with 0 when valid production env vars are provided", () => {
    const output = execFileSync(
      "node",
      ["--import", "tsx", scriptPath, "--skip-secrets"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "production",
          PUBLIC_ORIGIN: "https://eqsr.ham.radio",
          D1_DATABASE_ID: "12345678-1234-1234-1234-123456789abc",
          TEST_AUTH_ENABLED: "0",
          SKIP_REMOTE_SECRETS: "1"
        }
      }
    );
    expect(output).toContain("PRODUCTION_CONFIG_OK");
  });

  it("fails and exits non-zero when APP_ENV=production but D1 ID is placeholder", () => {
    expect(() => {
      execFileSync(
        "node",
        ["--import", "tsx", scriptPath, "--skip-secrets"],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            APP_ENV: "production",
            PUBLIC_ORIGIN: "https://eqsr.ham.radio",
            D1_DATABASE_ID: "00000000-0000-0000-0000-000000000001",
            TEST_AUTH_ENABLED: "0",
            SKIP_REMOTE_SECRETS: "1"
          }
        }
      );
    }).toThrow();
  });
});
