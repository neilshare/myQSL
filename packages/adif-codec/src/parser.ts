import type { AdifError, AdifParseResult, AdifRecord } from "./types";

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source[index] === "\n") line += 1;
  return line;
}

function error(source: string, code: AdifError["code"], offset: number, detail: string): AdifError {
  return { code, offset, line: lineAt(source, offset), detail };
}

export function parseAdif(source: string): AdifParseResult {
  const result: AdifParseResult = { header: null, records: [], errors: [] };
  let offset = 0;
  let headerFields: Record<string, string> = {};
  let headerTypes: Record<string, string | undefined> = {};
  let currentFields: Record<string, string> = {};
  let currentTypes: Record<string, string | undefined> = {};
  let inHeader = true;

  while (offset < source.length) {
    const tagStart = source.indexOf("<", offset);
    if (tagStart < 0) break;
    offset = tagStart;
    const close = source.indexOf(">", tagStart + 1);
    if (close < 0) {
      result.errors.push(error(source, "INVALID_TAG", tagStart, "Tag is not terminated"));
      break;
    }
    const rawTag = source.slice(tagStart + 1, close).trim();
    const parts = rawTag.split(":");
    const name = parts[0]?.toUpperCase() ?? "";
    const control = name === "EOH" || name === "EOR";
    let length: number | null = null;
    let type: string | undefined;
    if (!control) {
      if (!/^[A-Z][A-Z0-9_]*$/u.test(name) || parts.length < 2 || parts.length > 3 || !/^\d+$/u.test(parts[1] ?? "")) {
        result.errors.push(error(source, "INVALID_TAG", tagStart, `Invalid ADIF tag: ${rawTag}`));
        offset = close + 1;
        continue;
      }
      length = Number(parts[1]);
      type = parts[2]?.toUpperCase();
      if (!Number.isSafeInteger(length) || length < 0) {
        result.errors.push(error(source, "INVALID_TAG", tagStart, `Invalid length for ${name}`));
        offset = close + 1;
        continue;
      }
    }

    if (control) {
      if (name === "EOH") {
        result.header = { fields: headerFields, types: headerTypes };
        inHeader = false;
      } else {
        if (inHeader && Object.keys(headerFields).length > 0 && Object.keys(currentFields).length === 0) {
          currentFields = headerFields;
          currentTypes = headerTypes;
          headerFields = {};
          headerTypes = {};
          inHeader = false;
        }
        if (Object.keys(currentFields).length > 0) {
          result.records.push({ fields: currentFields, types: currentTypes });
          currentFields = {};
          currentTypes = {};
        }
      }
      offset = close + 1;
      continue;
    }

    const valueStart = close + 1;
    const valueEnd = valueStart + (length ?? 0);
    const nextTag = source.indexOf("<", valueStart);
    if (valueEnd > source.length || (nextTag >= 0 && nextTag < valueEnd)) {
      result.errors.push(error(source, "TRUNCATED_VALUE", tagStart, `${name} declares ${length} characters but the value is truncated`));
      offset = nextTag >= 0 ? nextTag : source.length;
      continue;
    }
    const value = source.slice(valueStart, valueEnd);
    if (/[\u0080-\uFFFF]/u.test(value) || /[\u0080-\uFFFF]/u.test(name)) {
      result.errors.push(error(source, "NON_ASCII_ADI", tagStart, `Non-ASCII content in ${name}`));
    }
    const fields = inHeader ? headerFields : currentFields;
    const types = inHeader ? headerTypes : currentTypes;
    fields[name] = value;
    types[name] = type;
    offset = valueEnd;
  }

  if (Object.keys(currentFields).length > 0) result.errors.push(error(source, "MISSING_EOR", source.length, "Final ADIF record is missing <EOR>"));
  return result;
}
