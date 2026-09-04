export type BackupParams = { requested_at?: string };

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_RATE_LIMITER: RateLimit;
  APP_ENV: "local" | "staging" | "production";
  PUBLIC_ORIGIN: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  D1_REST_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  D1_DATABASE_ID?: string;
  D1_BACKUP_WORKFLOW: Workflow<BackupParams>;
  RATE_LIMIT_SALT?: string;
  TEST_AUTH_ENABLED?: string;
}

