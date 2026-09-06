import type { MiddlewareHandler } from "hono";
import { nanoid } from "nanoid";
import type { Env } from "../env";

export type AgentContext = { deviceId: string; profileIds: string[]; actor: string };
export type RequestVariables = { requestId: string; actor: string; agent: AgentContext };

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export const requestContext: MiddlewareHandler<{ Bindings: Env; Variables: RequestVariables }> = async (c, next) => {
  const header = c.req.header("X-Request-Id")?.trim();
  const requestId = header && REQUEST_ID_REGEX.test(header) ? header : nanoid(16);
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
};
