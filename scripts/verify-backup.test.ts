import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalRowHash, verifyBackupDump, type BackupManifest } from "./verify-backup.mts";

describe("verify-backup script (V2-08 Manifest-Driven Verification)", () => {
  const scriptPath = resolve(process.cwd(), "scripts/verify-backup.mts");
  const fixtureSqlPath = resolve(process.cwd(), "apps/worker/test/fixtures/backup.sql");
  const fixtureManifestPath = resolve(process.cwd(), "apps/worker/test/fixtures/backup.manifest.json");

  it("passes for valid backup.sql fixture with manifest evidence", () => {
    const output = execFileSync(
      "node",
      [
        "--import",
        "tsx",
        scriptPath,
        "--sql",
        fixtureSqlPath,
        "--database",
        "test-db",
        "--manifest",
        fixtureManifestPath
      ],
      { encoding: "utf8" }
    );
    expect(output).toContain("RESTORE_VERIFIED tables=9");
    expect(output).toContain("backup_id=backup-fixture-001");
    expect(output).toContain("counts_matched=9");
    expect(output).toContain("samples_verified=2");
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

  it("fails when a row is deleted (row count mismatch against manifest)", () => {
    const originalSql = readFileSync(fixtureSqlPath, "utf8");
    const manifest: BackupManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));

    // Delete the QSO insert and update sql_sha256 to isolate row count assertion
    const deletedRowSql = originalSql.replace(/INSERT INTO qsos VALUES[^;]+;/u, "");
    const manifestWithUpdatedChecksum: BackupManifest = {
      ...manifest,
      sql_sha256: createHash("sha256").update(deletedRowSql).digest("hex")
    };
    expect(() => {
      verifyBackupDump({ sql: deletedRowSql, manifest: manifestWithUpdatedChecksum });
    }).toThrow(/ROW_COUNT_MISMATCH: Table qsos expected 1 rows, but restored 0 rows/);
  });

  it("fails when a sample row is modified or tampered (sample canonical hash mismatch)", () => {
    const originalSql = readFileSync(fixtureSqlPath, "utf8");
    const manifest: BackupManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));

    // Tamper the station callsign from BA4RC to BY1CRA and update sql_sha256 to isolate sample hash assertion
    const tamperedSql = originalSql.replace("'BA4RC'", "'BY1CRA'");
    const manifestWithTamperedChecksum: BackupManifest = {
      ...manifest,
      sql_sha256: createHash("sha256").update(tamperedSql).digest("hex")
    };
    expect(() => {
      verifyBackupDump({ sql: tamperedSql, manifest: manifestWithTamperedChecksum });
    }).toThrow(/SAMPLE_HASH_MISMATCH: Table stations row id=1/);
  });

  it("fails when SQL checksum does not match manifest sql_sha256", () => {
    const originalSql = readFileSync(fixtureSqlPath, "utf8");
    const manifest: BackupManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));

    // Appending a comment changes the SQL checksum
    const modifiedSql = originalSql + "\n-- extra comment";
    expect(() => {
      verifyBackupDump({ sql: modifiedSql, manifest });
    }).toThrow(/SQL_CHECKSUM_MISMATCH/);
  });

  it("fails when a sample row id is missing in the restored database", () => {
    const originalSql = readFileSync(fixtureSqlPath, "utf8");
    const manifest: BackupManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));

    const modifiedManifest: BackupManifest = {
      ...manifest,
      sample_hashes: [
        ...manifest.sample_hashes,
        { table: "stations", id: 99999, expected_sha256: "deadbeef" }
      ]
    };

    expect(() => {
      verifyBackupDump({ sql: originalSql, manifest: modifiedManifest });
    }).toThrow(/SAMPLE_ROW_MISSING/);
  });

  it("calculates deterministic canonicalRowHash regardless of key order", () => {
    const rowA = { b: "world", a: "hello", c: 42, d: null };
    const rowB = { a: "hello", d: null, c: 42, b: "world" };

    expect(canonicalRowHash(rowA)).toBe(canonicalRowHash(rowB));
  });
});

