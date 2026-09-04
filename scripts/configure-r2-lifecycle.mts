import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const r2LifecycleRules = {
  rules: [
    {
      id: "delete-daily-backups-after-30-days",
      enabled: true,
      conditions: {
        prefix: "backups/daily/"
      },
      action: {
        type: "Delete",
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      }
    },
    {
      id: "delete-monthly-backups-after-365-days",
      enabled: true,
      conditions: {
        prefix: "backups/monthly/"
      },
      action: {
        type: "Delete",
        maxAgeSeconds: 365 * 24 * 60 * 60 // 365 days
      }
    }
  ]
};

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.D1_REST_API_TOKEN;
  const bucket = process.env.R2_BUCKET_NAME || "eqsr-media";

  const configPath = resolve(process.cwd(), "infra/r2-lifecycle.json");
  await writeFile(configPath, JSON.stringify(r2LifecycleRules, null, 2), "utf8");
  console.log("R2 Lifecycle policy written to: " + configPath);

  if (!accountId || !token) {
    console.log("CLOUDFLARE_ACCOUNT_ID and token not set; skipped remote R2 API configuration.");
    return;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(r2LifecycleRules)
  });

  if (!response.ok) {
    throw new Error(`Failed to configure R2 lifecycle: ${response.status} ${response.statusText}`);
  }
  console.log(`R2 Lifecycle successfully applied to bucket: ${bucket}`);
}

if (process.argv[1]?.endsWith("configure-r2-lifecycle.mts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
