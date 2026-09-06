import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const output = join(root, "dist", "agent");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "apps", "agent"), join(output, "package"), { recursive: true, filter: (source) => !source.includes("node_modules") && !source.includes(".DS_Store") });
await cp(join(root, "pnpm-lock.yaml"), join(output, "pnpm-lock.yaml"));
await writeFile(join(output, "runtime-manifest.json"), JSON.stringify({ name: "myqsl-agent", version: "1.1.0", node: ">=24 <25", generated_at: new Date().toISOString(), source: "apps/agent" }, null, 2));
const archive = join(output, "myqsl-agent-v1.1.0.tar.gz");
execFileSync("tar", ["-czf", archive, "-C", output, "package", "pnpm-lock.yaml", "runtime-manifest.json"]);
const digest = createHash("sha256").update(await (await import("node:fs/promises")).readFile(archive)).digest("hex");
await writeFile(join(output, "SHA256SUMS"), `${digest}  ${archive.split("/").pop()}\n`);
console.log(`Agent package created at ${output}`);
