export function problem(
  status: number,
  type: string,
  title: string,
  detail: string,
  instance: string,
  ext: Record<string, unknown> = {}
): Response {
  return new Response(JSON.stringify({ type, title, status, detail, instance, ...ext }), {
    status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export const Problems = {
  authRequired: "https://myqsl.app/problems/auth-required",
  authInvalid: "https://myqsl.app/problems/auth-invalid",
  originForbidden: "https://myqsl.app/problems/origin-forbidden",
  rateLimited: "https://myqsl.app/problems/rate-limited",
  notFound: "https://myqsl.app/problems/not-found",
  internalError: "https://myqsl.app/problems/internal-error",
  serviceUnavailable: "https://myqsl.app/problems/service-unavailable"
} as const;

