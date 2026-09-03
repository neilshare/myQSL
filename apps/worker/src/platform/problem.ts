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
  authRequired: "https://eqsr.app/problems/auth-required",
  authInvalid: "https://eqsr.app/problems/auth-invalid",
  originForbidden: "https://eqsr.app/problems/origin-forbidden",
  rateLimited: "https://eqsr.app/problems/rate-limited",
  notFound: "https://eqsr.app/problems/not-found"
} as const;
