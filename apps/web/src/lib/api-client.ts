export class ProblemError extends Error {
  constructor(readonly status: number, readonly problem: Record<string, unknown>) { super(String(problem.detail ?? problem.title ?? "Request failed")); }
  static async fromResponse(response: Response): Promise<ProblemError> {
    let payload: Record<string, unknown> = {};
    try { payload = await response.json() as Record<string, unknown>; } catch { payload = { title: response.statusText }; }
    return new ProblemError(response.status, payload);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<{ data: T; etag: string | null }> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-EQSR-Request": "1", ...init.headers } });
  if (!response.ok) throw await ProblemError.fromResponse(response);
  return { data: response.status === 204 ? (undefined as T) : await response.json() as T, etag: response.headers.get("etag") };
}

export const api = {
  qsos: {
    list: (query = "") => apiFetch<{ data: unknown[]; next_cursor: string | null }>(`/api/v1/qsos${query}`),
    patch: (id: number, patch: Record<string, unknown>, etag: string) => apiFetch(`/api/v1/qsos/${id}`, { method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(patch) }),
    create: (input: Record<string, unknown>) => apiFetch(`/api/v1/qsos`, { method: "POST", body: JSON.stringify(input) }),
    delete: (id: number, etag: string) => apiFetch(`/api/v1/qsos/${id}`, { method: "DELETE", headers: { "If-Match": etag } }),
    restore: (id: number) => apiFetch<{ data: unknown }>(`/api/v1/qsos/${id}/restore`, { method: "POST" })
  },
  stations: {
    list: () => apiFetch<{ data: Array<Record<string, unknown>> }>("/api/v1/stations"),
    create: (input: Record<string, unknown>) => apiFetch("/api/v1/stations", { method: "POST", body: JSON.stringify(input) }),
    patch: (id: number, patch: Record<string, unknown>, etag: string) => apiFetch(`/api/v1/stations/${id}`, { method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(patch) })
  },
  imports: {
    createJob: (input: Record<string, unknown>) => apiFetch<{ id: string }>("/api/v1/imports", { method: "POST", body: JSON.stringify(input) }).then((result) => result.data),
    uploadChunk: (id: string, input: Record<string, unknown>) => apiFetch(`/api/v1/imports/${id}/chunks`, { method: "POST", body: JSON.stringify(input) }).then((result) => result.data),
    completeJob: (id: string) => apiFetch<{ id: string; status: string }>(`/api/v1/imports/${id}/complete`, { method: "POST" }).then((result) => result.data)
  }
};
