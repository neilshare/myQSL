import type { MiddlewareHandler } from "hono";
import { nanoid } from "nanoid";
import type { Env } from "../env";

export type RequestVariables = { requestId: string; actor: string };

export const requestContext: MiddlewareHandler<{ Bindings: Env; Variables: RequestVariables }> = async (c, next) => {
  const requestId = c.req.header("X-Request-Id")?.slice(0, 80) || nanoid(16);
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
};
