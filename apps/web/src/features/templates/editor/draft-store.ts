export type DraftRecord = { templateId: number | null; document: unknown; baseVersion: number; savedAt: number; formatVersion: 1 };

function isDraftRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DraftRecord>;
  return record.formatVersion === 1 && (record.templateId === null || typeof record.templateId === "number") && typeof record.baseVersion === "number" && typeof record.savedAt === "number" && "document" in record;
}

export class DraftStore {
  private readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  private readonly prefix: string;
  private databasePromise?: Promise<IDBDatabase>;
  constructor(storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">, prefix = "myqsl:template-draft:") {
    this.storage = storage ?? (typeof indexedDB === "undefined" ? (typeof localStorage === "undefined" ? undefined : localStorage) : undefined);
    this.prefix = prefix;
  }
  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("myqsl-template-studio", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Draft database unavailable"));
    });
    return this.databasePromise;
  }
  private async put(key: string, value: DraftRecord): Promise<void> {
    if (this.storage) { this.storage.setItem(key, JSON.stringify(value)); return; }
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => { const request = database.transaction("drafts", "readwrite").objectStore("drafts").put(value, key); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error ?? new Error("Draft storage failed")); });
  }
  private async get(key: string): Promise<unknown> {
    if (this.storage) { const raw = this.storage.getItem(key); if (!raw) return null; try { return JSON.parse(raw) as unknown; } catch { return null; } }
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => { const request = database.transaction("drafts", "readonly").objectStore("drafts").get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Draft storage failed")); });
  }
  private async remove(key: string): Promise<void> {
    if (this.storage) { this.storage.removeItem(key); return; }
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => { const request = database.transaction("drafts", "readwrite").objectStore("drafts").delete(key); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error ?? new Error("Draft storage failed")); });
  }
  async save(record: DraftRecord): Promise<void> {
    if (!isDraftRecord(record)) throw new Error("Invalid draft record");
    await this.put(`${this.prefix}${record.templateId ?? "new"}`, record);
  }
  async load(templateId: number | null): Promise<DraftRecord | null> {
    const parsed = await this.get(`${this.prefix}${templateId ?? "new"}`);
    return isDraftRecord(parsed) ? parsed : null;
  }
  async clear(templateId: number | null): Promise<void> { await this.remove(`${this.prefix}${templateId ?? "new"}`); }
}
