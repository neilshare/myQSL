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

    // Check request 1: initial export request MUST send output_format: polling
    expect(recordedRequests[0].body).toEqual({ output_format: "polling" });
    // Check request 2 & 3: polling request MUST send current_bookmark: bookmark-abc-123
    expect(recordedRequests[1].body).toEqual({ current_bookmark: "bookmark-abc-123" });
    expect(recordedRequests[2].body).toEqual({ current_bookmark: "bookmark-abc-123" });
  });
});

