import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { BackupRepository } from "../../src/modules/backup/repository";
import { BackupService } from "../../src/modules/backup/service";

describe("backup bookkeeping", () => {
  it("records a failed run without leaking credentials", async () => {
    const service = new BackupService(
      new BackupRepository(env.DB),
      env.MEDIA,
      { accountId: "", databaseId: "", token: "secret-token" },
      async () => new Response("unavailable", { status: 503 })
    );
    const result = await service.run("2026-09-03T20:00:00.000Z", "test-instance");
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("EXPORT_UNAVAILABLE");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("follows official D1 polling protocol with output_format polling and current_bookmark", async () => {
    const recordedRequests: Array<{ url: string; method: string; body: any }> = [];
    let pollCount = 0;

    const mockFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      recordedRequests.push({ url, method, body });

      if (url.includes("/export")) {
        if (body?.output_format === "polling") {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                status: "active",
                at_bookmark: "bookmark-abc-123"
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (body?.current_bookmark === "bookmark-abc-123") {
          pollCount += 1;
          if (pollCount === 1) {
            // Still in progress
            return new Response(
              JSON.stringify({
                success: true,
                result: {
                  status: "active",
                  at_bookmark: "bookmark-abc-123"
                }
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          // Completed on second poll
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                status: "complete",
                at_bookmark: "bookmark-abc-123",
                signed_url: "https://r2-signed-download.example.com/dump.sql"
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      if (url.includes("r2-signed-download.example.com")) {
        return new Response("CREATE TABLE test (id int);", {
          status: 200,
          headers: { "Content-Type": "application/sql" }
        });
      }

      return new Response("Not found", { status: 404 });
    };

    const service = new BackupService(
      new BackupRepository(env.DB),
      env.MEDIA,
      { accountId: "acc-1", databaseId: "db-1", token: "tok-1" },
      mockFetcher
    );

    const result = await service.run("2026-09-03T20:00:00.000Z", "poll-test-instance");
    expect(result.status).toBe("completed");
    expect(result.export_bookmark).toBe("bookmark-abc-123");
    expect(result.content_sha256).toBeDefined();
    expect(typeof result.content_sha256).toBe("string");

    // Check request 1: initial export request MUST send output_format: polling
    expect(recordedRequests[0].body).toEqual({ output_format: "polling" });
    // Check request 2 & 3: polling request MUST send current_bookmark: bookmark-abc-123
    expect(recordedRequests[1].body).toEqual({ current_bookmark: "bookmark-abc-123" });
    expect(recordedRequests[2].body).toEqual({ current_bookmark: "bookmark-abc-123" });
  });

  it("guards active running backup without mislabeling it as failed when duplicate run occurs", async () => {
    const repo = new BackupRepository(env.DB);
    const existingActive = await repo.create({
      id: "active-run-123",
      instanceId: "active-instance-1",
      startedAt: Date.now()
    });

    const service = new BackupService(
      repo,
      env.MEDIA,
      { accountId: "acc-1", databaseId: "db-1", token: "tok-1" }
    );

    // Attempting to create another concurrent run must throw CONCURRENT_BACKUP_RUNNING
    await expect(service.createRun(new Date().toISOString(), "duplicate-instance-2")).rejects.toThrow(
      "CONCURRENT_BACKUP_RUNNING"
    );

    // The original active run MUST remain in running status (NOT failed)
    const afterAttempt = await repo.get(existingActive.id);
    expect(afterAttempt?.status).toBe("running");
    expect(afterAttempt?.error_code).toBeNull();

    // Clean up
    await repo.fail(existingActive.id, "TEST_CLEANUP", Date.now());
  });

  it("writes to monthly prefix on first day of month", async () => {
    const writtenKeys: string[] = [];
    const mockMedia = {
      put: async (key: string) => {
        writtenKeys.push(key);
        return { etag: "mock-etag", size: 123 };
      }
    } as unknown as R2Bucket;

    const mockFetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/export")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              status: "complete",
              at_bookmark: "bm-first-day",
              signed_url: "https://r2-download.example.com/dump.sql"
            }
          }),
          { status: 200 }
        );
      }
      return new Response("CREATE TABLE foo (bar int);", { status: 200 });
    };

    const service = new BackupService(
      new BackupRepository(env.DB),
      mockMedia,
      { accountId: "acc-1", databaseId: "db-1", token: "tok-1" },
      mockFetcher
    );

    // 2026-10-01 is day "01" -> triggers monthly key write
    const result = await service.run("2026-10-01T20:00:00.000Z", "monthly-inst-1");
    expect(result.status).toBe("completed");
    expect(writtenKeys).toContain("backups/daily/2026/10/01/monthly-inst-1.sql");
    expect(writtenKeys).toContain("backups/monthly/2026/10/monthly-inst-1.sql");
  });
});


