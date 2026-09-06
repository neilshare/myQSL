import { z } from "zod";
import { isIP } from "node:net";

export const AgentConfigSchema = z.object({
  origin: z.string().url(),
  device_token: z.string().min(32).max(512),
  access_client_id: z.string().min(1).max(256),
  access_client_secret: z.string().min(1).max(512),
  profile_id: z.string().min(1).max(80),
  source_kind: z.enum(["wsjtx", "n1mm"]),
  bind_address: z.string().refine((value) => value === "localhost" || isIP(value) > 0, "bind_address must be a valid IP address or localhost").default("127.0.0.1"),
  wsjtx_port: z.number().int().min(1024).max(65535).default(2237),
  n1mm_port: z.number().int().min(1024).max(65535).default(12060)
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
