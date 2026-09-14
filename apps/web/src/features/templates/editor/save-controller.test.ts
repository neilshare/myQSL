import { describe, expect, it, vi } from "vitest";
import { ProblemError } from "../../../lib/api-client";
import { DraftStore } from "./draft-store";
import { saveTemplate } from "./save-controller";

describe("template save controller", () => {
  it("reuses the create idempotency key and returns the server version", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 7, version: 1 } });
    const result = await saveTemplate({ id: null, name: "new", document: { schema_version: 2 }, baseVersion: 1, idempotencyKey: "create-key" }, { create, patch: vi.fn() });
    expect(create).toHaveBeenCalledWith({ name: "new", layout: { schema_version: 2 } }, "create-key");
    expect(result).toEqual({ status: "saved", row: { id: 7, version: 1 } });
  });

  it("keeps the local document when the server returns 412", async () => {
    const conflict = new ProblemError(412, { title: "Conflict" });
    const result = await saveTemplate({ id: 7, name: "edited", document: { schema_version: 2 }, baseVersion: 2, idempotencyKey: "unused" }, { create: vi.fn(), patch: vi.fn().mockRejectedValue(conflict) });
    expect(result.status).toBe("conflict");
  });

  it("isolates malformed drafts and surfaces storage quota failures", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const store = new DraftStore(storage);
    await store.save({ templateId: 7, document: { schema_version: 2 }, baseVersion: 2, savedAt: 1, formatVersion: 1 });
    values.set("myqsl:template-draft:7", "not-json");
    expect(await store.load(7)).toBeNull();
    const quota = new DraftStore({ getItem: () => null, setItem: () => { throw new DOMException("quota", "QuotaExceededError"); }, removeItem: () => undefined });
    await expect(quota.save({ templateId: 7, document: {}, baseVersion: 1, savedAt: 1, formatVersion: 1 })).rejects.toThrow("quota");
  });
});
