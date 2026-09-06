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
  AGENT_ACCESS_AUD?: string;
  AGENT_ACCESS_TEAM_DOMAIN?: string;
  AGENT_ACCESS_CLIENT_ID?: string;
  AGENT_ACCESS_CLIENT_SECRET?: string;
  D1_REST_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  D1_DATABASE_ID?: string;
  D1_BACKUP_WORKFLOW: Workflow<BackupParams>;
  RATE_LIMIT_SALT?: string;
  TEST_AUTH_ENABLED?: string;
  ALLOWED_ORIGINS?: string;
  AUTH_DISABLED?: string;
  QRZ_USERNAME?: string;
  QRZ_PASSWORD?: string;
  QRZ_ENDPOINT?: string;
  PII_KEY_VERSION?: string;
  PII_KEY_B64?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_DAILY_QUOTA?: string;
  FEATURE_AGENT_INGEST?: string;
  FEATURE_PRINT?: string;
  FEATURE_EMAIL_DELIVERY?: string;
}
