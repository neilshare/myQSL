import type {
  QsoRecord,
  StationRecord,
  CardTemplateRow,
  CardRow,
  PublicCardSummary
} from "./api-types";
import type { CardTemplate, QsoInput, StationInput } from "@myqsl/domain";

export * from "./api-types";

export class ProblemError extends Error {
  constructor(readonly status: number, readonly problem: Record<string, unknown>) { super(String(problem.detail ?? problem.title ?? "Request failed")); }
  static async fromResponse(response: Response): Promise<ProblemError> {
    let payload: Record<string, unknown> = {};
    try { payload = await response.json() as Record<string, unknown>; } catch { payload = { title: response.statusText }; }
    return new ProblemError(response.status, payload);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<{ data: T; next_cursor?: string | null; etag: string | null }> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-MYQSL-Request": "1", "X-EQSR-Request": "1", ...init.headers } });
  if (!response.ok) throw await ProblemError.fromResponse(response);
  if (response.status === 204) return { data: undefined as T, etag: response.headers.get("etag") };
  const json = (await response.json()) as Record<string, unknown>;
  const hasData = json !== null && typeof json === "object" && "data" in json;
  const data = (hasData ? json.data : json) as T;
  const next_cursor = (json !== null && typeof json === "object" && "next_cursor" in json) ? (json.next_cursor as string | null) : undefined;
  return { data, next_cursor, etag: response.headers.get("etag") };
}

export const api = {
  qsos: {
    list: (query = "") => apiFetch<QsoRecord[]>(`/api/v1/qsos${query}`),
    patch: (id: number, patch: Partial<QsoInput>, etag: string) => apiFetch<QsoRecord>(`/api/v1/qsos/${id}`, { method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(patch) }),
    create: (input: QsoInput | Record<string, unknown>) => apiFetch<QsoRecord>(`/api/v1/qsos`, { method: "POST", body: JSON.stringify(input) }),
    delete: (id: number, etag: string) => apiFetch<void>(`/api/v1/qsos/${id}`, { method: "DELETE", headers: { "If-Match": etag } }),
    restore: (id: number) => apiFetch<QsoRecord>(`/api/v1/qsos/${id}/restore`, { method: "POST" })
  },
  stations: {
    list: () => apiFetch<StationRecord[]>("/api/v1/stations"),
    create: (input: StationInput | Record<string, unknown>) => apiFetch<StationRecord>("/api/v1/stations", { method: "POST", body: JSON.stringify(input) }),
    patch: (id: number, patch: Partial<StationInput> | Record<string, unknown>, etag: string) => apiFetch<StationRecord>(`/api/v1/stations/${id}`, { method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(patch) })
  },
  templates: {
    list: () => apiFetch<CardTemplateRow[]>("/api/v1/card-templates"),
    get: (id: number) => apiFetch<CardTemplateRow>(`/api/v1/card-templates/${id}`),
    create: (input: { name: string; layout: CardTemplate }) => apiFetch<CardTemplateRow>("/api/v1/card-templates", { method: "POST", body: JSON.stringify(input) }),
    patch: (id: number, patch: { name?: string; layout?: CardTemplate; version: number }, etag?: string) =>
      apiFetch<CardTemplateRow>(`/api/v1/card-templates/${id}`, {
        method: "PATCH",
        headers: etag ? { "If-Match": etag } : { "If-Match": `"${patch.version}"` },
        body: JSON.stringify(patch)
      }),
    uploadBackground: async (id: number, file: Blob | ArrayBuffer, contentType = "image/png") => {
      const response = await fetch(`/api/v1/card-templates/${id}/background`, {
        method: "PUT",
        headers: { "Content-Type": contentType, "X-MYQSL-Request": "1", "X-EQSR-Request": "1" },
        credentials: "same-origin",
        body: file
      });
      if (!response.ok) throw await ProblemError.fromResponse(response);
      const json = await response.json();
      return (json && typeof json === "object" && "data" in json ? json.data : json) as { key: string; etag: string };
    }
  },
  cards: {
    list: (query = "") => apiFetch<CardRow[]>(`/api/v1/cards${query}`),
    get: (id: string) => apiFetch<CardRow>(`/api/v1/cards/${id}`),
    create: (input: { qso_id: number; template_id: number }) => apiFetch<CardRow>("/api/v1/cards", { method: "POST", body: JSON.stringify(input) }),
    uploadImage: async (id: string, imageBytes: Blob | ArrayBuffer) => {
      const response = await fetch(`/api/v1/cards/${id}/image`, {
        method: "PUT",
        headers: { "Content-Type": "image/png", "X-MYQSL-Request": "1", "X-EQSR-Request": "1" },
        credentials: "same-origin",
        body: imageBytes
      });
      if (!response.ok) throw await ProblemError.fromResponse(response);
      const json = await response.json();
      return { data: (json && typeof json === "object" && "data" in json ? json.data : json) as CardRow };
    },
    publish: (id: string) => apiFetch<CardRow>(`/api/v1/cards/${id}/publish`, { method: "POST" }),
    void: (id: string) => apiFetch<CardRow>(`/api/v1/cards/${id}/void`, { method: "POST" })
  },
  public: {
    lookup: (input: { call: string; qso_date: string }) => apiFetch<PublicCardSummary[]>("/api/v1/public/card-lookup", { method: "POST", body: JSON.stringify(input) })
  },
  imports: {
    createJob: (input: Record<string, unknown>) => apiFetch<{ id: string }>("/api/v1/imports", { method: "POST", body: JSON.stringify(input) }).then((result) => ((result.data as any)?.data ?? result.data)),
    getJob: (id: string) => apiFetch<any>(`/api/v1/imports/${id}`).then((result) => ((result.data as any)?.data ?? result.data)),
    uploadChunk: (id: string, input: Record<string, unknown>) => apiFetch(`/api/v1/imports/${id}/chunks`, { method: "POST", body: JSON.stringify(input) }).then((result) => ((result.data as any)?.data ?? result.data)),
    completeJob: (id: string) => apiFetch<{ id: string; status: string }>(`/api/v1/imports/${id}/complete`, { method: "POST" }).then((result) => ((result.data as any)?.data ?? result.data))
  }
};

