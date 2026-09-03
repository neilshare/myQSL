import { nanoid } from "nanoid";
import { BackupRepository, type BackupRunRow } from "./repository";

export interface BackupConfig { accountId: string; databaseId: string; token: string; }
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class BackupService {
  constructor(private readonly repository: BackupRepository, private readonly media: R2Bucket, private readonly config: BackupConfig, private readonly fetcher: Fetcher = fetch, private readonly now: () => number = Date.now) {}

  async run(requestedAt = new Date(this.now()).toISOString(), instanceId = nanoid(16)): Promise<BackupRunRow> {
    const existing = await this.repository.running();
    if (existing) return this.repository.fail(existing.id, "DUPLICATE_RUNNING", this.now());
    const run = await this.repository.create({ id: nanoid(16), instanceId, startedAt: Date.parse(requestedAt) || this.now() });
    if (!this.config.accountId || !this.config.databaseId || !this.config.token) return this.repository.fail(run.id, "EXPORT_UNAVAILABLE", this.now());
    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/export`;
      const headers = { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json" };
      const started = await this.fetcher(endpoint, { method: "POST", headers, body: JSON.stringify({ output_format: "sql" }) });
      if (!started.ok) return this.repository.fail(run.id, started.status === 429 ? "EXPORT_RATE_LIMITED" : "EXPORT_UNAVAILABLE", this.now());
      const job = await started.json() as { result?: { at_bookmark?: string; signed_url?: string; status?: string } };
      const ready = job.result?.signed_url ? job.result : await this.poll(endpoint, headers);
      if (!ready?.signed_url) return this.repository.fail(run.id, "EXPORT_TIMEOUT", this.now());
      const download = await this.fetcher(ready.signed_url);
      if (!download.ok || !download.body) return this.repository.fail(run.id, "DOWNLOAD_FAILED", this.now());
      const key = `backups/daily/${requestedAt.slice(0, 4)}/${requestedAt.slice(5, 7)}/${requestedAt.slice(8, 10)}/${instanceId}.sql`;
      const object = await this.media.put(key, download.body, { httpMetadata: { contentType: "application/sql", cacheControl: "private, max-age=31536000, immutable" } });
      if (!object) return this.repository.fail(run.id, "R2_WRITE_FAILED", this.now());
      return this.repository.complete(run.id, { bookmark: ready.at_bookmark ?? "", key, etag: object.etag, size: object.size, finishedAt: this.now() });
    } catch { return this.repository.fail(run.id, "EXPORT_UNAVAILABLE", this.now()); }
  }

  private async poll(endpoint: string, headers: HeadersInit) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await this.fetcher(endpoint, { headers });
      if (!response.ok) continue;
      const result = (await response.json() as { result?: { status?: string; signed_url?: string; at_bookmark?: string } }).result;
      if (result?.signed_url || result?.status === "complete") return result;
    }
    return null;
  }
}
