import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

describe("verify-backup script", () => {
  const scriptPath = resolve(process.cwd(), "scripts/verify-backup.mts");

  it("passes for valid backup.sql fixture", () => {
    const fixturePath = resolve(process.cwd(), "apps/worker/test/fixtures/backup.sql");
    const output = execFileSync(
      "node",
      ["--import", "tsx", scriptPath, "--sql", fixturePath, "--database", "test-db"],
      { encoding: "utf8" }
    );
    expect(output).toContain("RESTORE_VERIFIED tables=9");
  });

  it("fails and exits with non-zero exit code when SQL has syntax error", () => {
    const corruptPath = resolve(process.cwd(), "corrupt-test.sql");
    writeFileSync(corruptPath, "CREATE TABLE qsos (id INT); INVALID SQL SYNTAX HERE;", "utf8");

    try {
      expect(() => {
        execFileSync(
          "node",
          ["--import", "tsx", scriptPath, "--sql", corruptPath, "--database", "test-db"],
          { encoding: "utf8", stdio: "pipe" }
        );
      }).toThrow();
    } finally {
      try { unlinkSync(corruptPath); } catch {}
    }
  });

  it("fails and exits with non-zero exit code when required tables are missing", () => {
    const missingTablePath = resolve(process.cwd(), "missing-table.sql");
    writeFileSync(missingTablePath, "CREATE TABLE qsos (id INT);", "utf8");

    try {
      expect(() => {
        execFileSync(
          "node",
          ["--import", "tsx", scriptPath, "--sql", missingTablePath, "--database", "test-db"],
          { encoding: "utf8", stdio: "pipe" }
        );
      }).toThrow();
    } finally {
      try { unlinkSync(missingTablePath); } catch {}
    }
  });
});
