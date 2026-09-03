import { serializeAdif, type AdifRecord } from "@eqsr/adif-codec";

export async function exportAdif(api: { list: (cursor?: string) => Promise<{ data: Array<Record<string, unknown>>; next_cursor: string | null }> }): Promise<string> {
  const records: AdifRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.list(cursor);
    for (const row of page.data) {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) if (value !== null && value !== undefined && ["id", "version", "qso_at", "duplicate_ordinal", "source"].includes(key) === false) fields[key.toUpperCase()] = String(value);
      records.push({ fields, types: {} });
    }
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return serializeAdif(records, { programId: "eQSR", adifVersion: "3.1.7" });
}
