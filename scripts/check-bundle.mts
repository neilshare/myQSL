import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSize } from "./gzip-size.mjs";

async function walk(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); const files: string[] = []; for (const entry of entries) { if (entry.name === "node_modules" || entry.name === ".wrangler") continue; const path = join(directory, entry.name); if (entry.isDirectory()) files.push(...await walk(path)); else if (entry.isFile()) files.push(path); } return files; }
const dist = "apps/web/dist";
const files = await walk(dist);
const manifestPath = join(dist, ".vite/manifest.json");
let initialFiles = files.filter((file) => file.endsWith(".js"));
let editorFiles: string[] = [];
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, { isEntry?: boolean; file: string; imports?: string[]; dynamicImports?: string[] }>;
  const byFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
  const staticFiles = new Set<string>();
  const visit = (file: string) => { if (staticFiles.has(file)) return; staticFiles.add(file); const entry = byFile.get(file); for (const imported of entry?.imports ?? []) visit(byFile.get(imported)?.file ?? imported); };
  for (const entry of Object.values(manifest).filter((item) => item.isEntry)) visit(entry.file);
  initialFiles = [...staticFiles].map((file) => join(dist, file));
  const dynamicKeys = Object.values(manifest).flatMap((entry) => entry.dynamicImports ?? []).filter((item) => /StudioCanvas|konva|editor/iu.test(item));
  const editorFilesSet = new Set<string>();
  const visitEditor = (key: string) => { const entry = manifest[key]; if (!entry || editorFilesSet.has(entry.file)) return; editorFilesSet.add(entry.file); for (const imported of entry.imports ?? []) visitEditor(imported); };
  dynamicKeys.forEach(visitEditor);
  editorFiles = [...editorFilesSet].map((file) => join(dist, file));
} catch {
  // Older local builds without a manifest keep the conservative all-JS check.
}
const initialJs = (await Promise.all(initialFiles.filter((file) => file.endsWith(".js")).map((file) => gzipSize(file)))).reduce((sum, size) => sum + size, 0);
const editorJs = (await Promise.all(editorFiles.filter((file) => file.endsWith(".js")).map((file) => gzipSize(file)))).reduce((sum, size) => sum + size, 0);
const total = (await Promise.all(files.map(async (file) => (await stat(file)).size))).reduce((sum, size) => sum + size, 0);
if (initialJs > 250 * 1024) throw new Error(`Initial JS gzip budget exceeded: ${initialJs}`);
if (editorJs > 650 * 1024) throw new Error(`Editor JS gzip budget exceeded: ${editorJs}`);
if ((await Promise.all(files.map(async (file) => (await stat(file)).size))).some((size) => size > 5 * 1024 * 1024)) throw new Error("Static file budget exceeded");
if (total > 15 * 1024 * 1024) throw new Error(`Total static budget exceeded: ${total}`);
console.log(`BUNDLE_OK initial_js_gzip=${initialJs} editor_js_gzip=${editorJs} total_bytes=${total}`);
