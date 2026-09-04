import { nanoid } from "nanoid";
import { BackupRepository, type BackupRunRow } from "./repository";

export interface BackupConfig { accountId: string; databaseId: string; token: string; }
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class BackupService {
  constructor(
    private readonly repository: BackupRepository,
    private readonly media: R2Bucket,
    private readonly config: BackupConfig,
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async createRun(requestedAt: string, instanceId: string): Promise<BackupRunRow> {
    const existing = await this.repository.running();
    if (existing) {
      await this.repository.fail(existing.id, "DUPLICATE_RUNNING", this.now());
    }
    return this.repository.create({
      id: nanoid(16),
      instanceId,
      startedAt: Date.parse(requestedAt) || this.now()
    });
  }

  async startExport(): Promise<{ bookmark: string; status: string; signedUrl?: string }> {
    if (!this.config.accountId || !this.config.databaseId || !this.config.token) {
      throw new Error("EXPORT_UNAVAILABLE");
    }
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/export`;
    const headers = {
      Authorization: `Bearer ${this.config.token}`,
      "Content-Type": "application/json"
    };
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ output_format: "polling" })
    });
    if (!response.ok) {
      throw new Error(response.status === 429 ? "EXPORT_RATE_LIMITED" : "EXPORT_UNAVAILABLE");
    }
    const data = (await response.json()) as {
      result?: { at_bookmark?: string; status?: string; signed_url?: string };
    };
    if (!data.result?.at_bookmark) {
      throw new Error("EXPORT_UNAVAILABLE");
    }
    return {
      bookmark: data.result.at_bookmark,
      status: data.result.status ?? "active",
      signedUrl: data.result.signed_url
    };
  }

  async pollExport(bookmark: string): Promise<{ signedUrl: string; bookmark: string }> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/export`;
    const headers = {
      Authorization: `Bearer ${this.config.token}`,
      "Content-Type": "application/json"
    };
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ current_bookmark: bookmark })
    });
    if (!response.ok) {
      throw new Error(response.status === 429 ? "EXPORT_RATE_LIMITED" : "EXPORT_UNAVAILABLE");
    }
    const data = (await response.json()) as {
      result?: { status?: string; signed_url?: string; at_bookmark?: string };
    };
    const result = data.result;
    if (result?.signed_url || result?.status === "complete") {
      if (!result?.signed_url) throw new Error("EXPORT_MISSING_SIGNED_URL");
      return {
        signedUrl: result.signed_url,
        bookmark: result.at_bookmark ?? bookmark
      };
    }
    // Not yet complete - throw error to let Workflow retry mechanism back off
    throw new Error("EXPORT_IN_PROGRESS");
  }

  async downloadAndPut(
    signedUrl: string,
    requestedAt: string,
    instanceId: string
  ): Promise<{ key: string; etag: string; size: number }> {
    const download = await this.fetcher(signedUrl);
    if (!download.ok || !download.body) throw new Error("DOWNLOAD_FAILED");

    const dailyKey = `backups/daily/${requestedAt.slice(0, 4)}/${requestedAt.slice(5, 7)}/${requestedAt.slice(8, 10)}/${instanceId}.sql`;
    const isFirstDayOfMonth = requestedAt.slice(8, 10) === "01";

    const buffer = await download.arrayBuffer();
    const object = await this.media.put(dailyKey, buffer, {
      httpMetadata: {
        contentType: "application/sql",
        cacheControl: "private, max-age=31536000, immutable"
      }
    });
    if (!object) throw new Error("R2_WRITE_FAILED");

    if (isFirstDayOfMonth) {
      const monthlyKey = `backups/monthly/${requestedAt.slice(0, 4)}/${requestedAt.slice(5, 7)}/${instanceId}.sql`;
      await this.media.put(monthlyKey, buffer, {
        httpMetadata: {
          contentType: "application/sql",
          cacheControl: "private, max-age=31536000, immutable"
        }
      });
    }

    return {
      key: dailyKey,
      etag: object.etag,
      size: object.size
    };
  }

  async completeRun(
    runId: string,
    input: { bookmark: string; key: string; etag: string; size: number }
  ): Promise<BackupRunRow> {
    return this.repository.complete(runId, {
      bookmark: input.bookmark,
      key: input.key,
      etag: input.etag,
      size: input.size,
      finishedAt: this.now()
    });
  }

  async failRun(runId: string, code: string): Promise<BackupRunRow> {
    return this.repository.fail(runId, code, this.now());
  }

  async run(
    requestedAt = new Date(this.now()).toISOString(),
    instanceId = nanoid(16)
  ): Promise<BackupRunRow> {
    const run = await this.createRun(requestedAt, instanceId);
    if (!this.config.accountId || !this.config.databaseId || !this.config.token) {
      return this.failRun(run.id, "EXPORT_UNAVAILABLE");
    }

    try {
      const init = await this.startExport();
      let ready: { signedUrl: string; bookmark: string };
      if (init.signedUrl) {
        ready = { signedUrl: init.signedUrl, bookmark: init.bookmark };
      } else {
        let polled: { signedUrl: string; bookmark: string } | null = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          try {
            polled = await this.pollExport(init.bookmark);
            if (polled) break;
          } catch (err: any) {
            if (err.message !== "EXPORT_IN_PROGRESS") throw err;
            await new Promise((r) => setTimeout(r, 50 * Math.pow(1.5, attempt)));
          }
        }
        if (!polled) return this.failRun(run.id, "EXPORT_TIMEOUT");
        ready = polled;
      }

      const stored = await this.downloadAndPut(ready.signedUrl, requestedAt, instanceId);
      return await this.completeRun(run.id, {
        bookmark: ready.bookmark,
        key: stored.key,
        etag: stored.etag,
        size: stored.size
      });
    } catch (err: any) {
      return this.failRun(run.id, err.message?.slice(0, 80) || "EXPORT_UNAVAILABLE");
    }
  }
}

