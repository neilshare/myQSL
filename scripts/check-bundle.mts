import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSize } from "./gzip-size.mjs";

async function walk(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); const files: string[] = []; for (const entry of entries) { if (entry.name === "node_modules" || entry.name === ".wrangler") continue; const path = join(directory, entry.name); if (entry.isDirectory()) files.push(...await walk(path)); else if (entry.isFile()) files.push(path); } return files; }
const dist = "apps/web/dist";
const files = await walk(dist);
const initialJs = (await Promise.all(files.filter((file) => file.endsWith(".js")).map((file) => gzipSize(file)))).reduce((sum, size) => sum + size, 0);
const total = (await Promise.all(files.map(async (file) => (await stat(file)).size))).reduce((sum, size) => sum + size, 0);
if (initialJs > 250 * 1024) throw new Error(`Initial JS gzip budget exceeded: ${initialJs}`);
if ((await Promise.all(files.map(async (file) => (await stat(file)).size))).some((size) => size > 5 * 1024 * 1024)) throw new Error("Static file budget exceeded");
if (total > 15 * 1024 * 1024) throw new Error(`Total static budget exceeded: ${total}`);
console.log(`BUNDLE_OK initial_js_gzip=${initialJs} total_bytes=${total}`);
