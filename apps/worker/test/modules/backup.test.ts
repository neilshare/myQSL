import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { BackupRepository } from "../../src/modules/backup/repository";
import { BackupService } from "../../src/modules/backup/service";

describe("backup bookkeeping", () => {
  it("records a failed run without leaking credentials", async () => {
    const service = new BackupService(new BackupRepository(env.DB), env.MEDIA, { accountId: "", databaseId: "", token: "secret-token" }, async () => new Response("unavailable", { status: 503 }));
    const result = await service.run("2026-09-03T20:00:00.000Z", "test-instance");
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("EXPORT_UNAVAILABLE");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
