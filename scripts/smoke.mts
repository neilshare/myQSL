const origin = process.argv[process.argv.indexOf("--origin") + 1];
if (!origin) throw new Error("Usage: smoke.mts --origin https://your-domain");
const url = new URL(origin);
if (url.protocol !== "https:") throw new Error("Smoke origin must use HTTPS");

async function status(path: string): Promise<number> {
  const response = await fetch(new URL(path, url), { redirect: "manual" });
  return response.status;
}
const health = await status("/healthz");
const shell = await status("/");
const owner = await status("/api/v1/qsos");
if (health !== 200 || shell !== 200 || owner !== 401) throw new Error(`Smoke failed with status health=${health} public_shell=${shell} owner_without_access=${owner}`);
console.log(`SMOKE_OK health=${health} public_shell=${shell} owner_without_access=${owner}`);
