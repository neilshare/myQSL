export type DraftRecord = { templateId: number | null; document: unknown; baseVersion: number; savedAt: number; formatVersion: 1 };

function isDraftRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DraftRecord>;
  return record.formatVersion === 1 && (record.templateId === null || typeof record.templateId === "number") && typeof record.baseVersion === "number" && typeof record.savedAt === "number" && "document" in record;
}

export class DraftStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = typeof localStorage === "undefined" ? { getItem: () => null, setItem: () => { throw new Error("Draft storage unavailable"); }, removeItem: () => undefined } : localStorage, private readonly prefix = "myqsl:template-draft:") {}
  async save(record: DraftRecord): Promise<void> {
    if (!isDraftRecord(record)) throw new Error("Invalid draft record");
    this.storage.setItem(`${this.prefix}${record.templateId ?? "new"}`, JSON.stringify(record));
  }
  async load(templateId: number | null): Promise<DraftRecord | null> {
    const raw = this.storage.getItem(`${this.prefix}${templateId ?? "new"}`);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isDraftRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  async clear(templateId: number | null): Promise<void> { this.storage.removeItem(`${this.prefix}${templateId ?? "new"}`); }
}
