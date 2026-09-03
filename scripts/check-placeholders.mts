import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
async function walk(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); const files: string[] = []; for (const entry of entries) { if (entry.name === "node_modules" || entry.name === ".wrangler" || entry.name === "dist" || entry.name === "test" || entry.name === "tests") continue; const path = join(directory, entry.name); if (entry.isDirectory()) files.push(...await walk(path)); else if (entry.isFile() && !entry.name.includes(".test.")) files.push(path); } return files; }
const files = [...await walk("apps"), ...await walk("docs/runbooks")];
const pattern = /\b(?:TBD|TODO|FIXME|fill in)\b|example\.com|example\.test/iu;
for (const file of files) { const text = await readFile(file, "utf8"); if (pattern.test(text)) throw new Error(`Placeholder found in ${file}`); }
console.log(`PLACEHOLDERS_OK files=${files.length}`);
