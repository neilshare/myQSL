import { serializeAdif, type AdifRecord } from "@eqsr/adif-codec";
import { qsoToAdifRecord } from "../imports/adif-mapper";

export async function exportAdif(api: { list: (cursor?: string) => Promise<{ data: Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }; next_cursor?: string | null }> }): Promise<string> {
  const records: AdifRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.list(cursor ? (cursor.startsWith("?") ? cursor : `?cursor=${cursor}`) : "");
    const raw = page.data;
    const rows = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
    for (const row of rows) {
      records.push(qsoToAdifRecord(row));
    }
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return serializeAdif(records, { programId: "eQSR", adifVersion: "3.1.7" });
}
