import { gzip } from "node:zlib";
import { readFile } from "node:fs/promises";
export async function gzipSize(file) { const data = await readFile(file); return new Promise((resolve, reject) => gzip(data, (error, result) => error ? reject(error) : resolve(result.byteLength))); }
