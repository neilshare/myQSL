import type { AdifMetadata, AdifRecord } from "./types";

function assertAscii(name: string, value: string): void {
  if (/[\u0080-\uFFFF]/u.test(name) || /[\u0080-\uFFFF]/u.test(value)) throw new Error(`NON_ASCII_ADI: ${name}`);
}

function tag(name: string, value: string, type?: string): string {
  assertAscii(name, value);
  const normalized = name.toUpperCase();
  return `<${normalized}:${value.length}${type ? `:${type}` : ""}>${value}`;
}

export function serializeAdif(records: AdifRecord[], metadata: AdifMetadata): string {
  assertAscii("PROGRAMID", metadata.programId);
  assertAscii("ADIF_VER", metadata.adifVersion);
  const header = `${tag("ADIF_VER", metadata.adifVersion)}${tag("PROGRAMID", metadata.programId)}<EOH>`;
  const body = records
    .map((record) => `${Object.keys(record.fields).map((name) => tag(name, record.fields[name] ?? "", record.types[name])).join("")}<EOR>`)
    .join("\n");
  return `${header}\n${body}\n`;
}
