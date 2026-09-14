import { ProblemError } from "../../../lib/api-client";

export type SaveRow = { id: number; version: number };
export type SaveInput = { id: number | null; name: string; document: unknown; baseVersion: number; idempotencyKey: string };
export type SaveApi = { create: (input: { name: string; layout: any }, idempotencyKey: string) => Promise<{ data: SaveRow }>; patch: (id: number, input: { name: string; layout: any; version: number }, etag?: string) => Promise<{ data: SaveRow }> };
export type SaveResult = { status: "saved"; row: SaveRow } | { status: "conflict" | "unauthorized" | "error"; error: unknown };

export async function saveTemplate(input: SaveInput, api: SaveApi): Promise<SaveResult> {
  try {
    if (input.id === null) return { status: "saved", row: (await api.create({ name: input.name, layout: input.document }, input.idempotencyKey)).data };
    return { status: "saved", row: (await api.patch(input.id, { name: input.name, layout: input.document, version: input.baseVersion }, `"${input.baseVersion}"`)).data };
  } catch (error) {
    if (error instanceof ProblemError && error.status === 412) return { status: "conflict", error };
    if (error instanceof ProblemError && error.status === 401) return { status: "unauthorized", error };
    return { status: "error", error };
  }
}
