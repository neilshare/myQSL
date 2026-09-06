import { XMLParser } from "fast-xml-parser";

export type DirectoryResult = { status: "ready" | "no_email" | "subscription_required" | "unavailable"; requested_call: string; resolved_call: string | null; email: string | null; error_code?: string };
type FetchLike = typeof fetch;
const parser = new XMLParser({ processEntities: false, htmlEntities: false, ignoreAttributes: true, removeNSPrefix: true, trimValues: true, parseTagValue: false });

function asString(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }

export class QrzClient {
  private session: { key: string; expiresAt: number } | null = null;
  private loginInFlight: Promise<string> | null = null;
  constructor(private readonly options: { username: string; password: string; endpoint?: string; agent?: string; fetcher?: FetchLike; now?: () => number }) {}

  async lookup(call: string): Promise<DirectoryResult> {
    const requested = call.trim().toUpperCase();
    if (!/^[A-Z0-9/]{3,16}$/u.test(requested)) return { status: "unavailable", requested_call: requested, resolved_call: null, email: null, error_code: "INVALID_CALL" };
    try {
      const session = await this.sessionKey();
      let result = await this.request(`s=${encodeURIComponent(session)}&callsign=${encodeURIComponent(requested)}`);
      if (result.error_code === "SESSION_INVALID") { this.session = null; result = await this.request(`s=${encodeURIComponent(await this.sessionKey())}&callsign=${encodeURIComponent(requested)}`); }
      return result;
    } catch (error) {
      return { status: "unavailable", requested_call: requested, resolved_call: null, email: null, error_code: error instanceof Error ? error.message.slice(0, 80) : "QRZ_UNAVAILABLE" };
    }
  }

  private async sessionKey(): Promise<string> {
    const now = (this.options.now ?? Date.now)();
    if (this.session && this.session.expiresAt > now + 30_000) return this.session.key;
    if (!this.loginInFlight) this.loginInFlight = this.login().finally(() => { this.loginInFlight = null; });
    return this.loginInFlight;
  }

  private async login(): Promise<string> {
    const response = await this.fetcher()(this.endpoint(), { method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ username: this.options.username, password: this.options.password, agent: this.options.agent ?? "myqsl/1.2" }) });
    const xml = await this.readBody(response);
    if (!response.ok) throw new Error("QRZ_LOGIN_HTTP");
    const root = parser.parse(xml) as Record<string, unknown>;
    const session = (root.QRZDatabase as Record<string, unknown> | undefined)?.Session as Record<string, unknown> | undefined;
    const key = asString(session?.Key);
    if (!key) throw new Error(asString(session?.Error) || "QRZ_LOGIN_FAILED");
    this.session = { key, expiresAt: (this.options.now ?? Date.now)() + 30 * 60_000 };
    return key;
  }

  private async request(form: string): Promise<DirectoryResult> {
    const requested = new URLSearchParams(form).get("callsign") ?? "";
    const response = await this.fetcher()(this.endpoint(), { method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const xml = await this.readBody(response);
    if (!response.ok) return { status: "unavailable", requested_call: requested, resolved_call: null, email: null, error_code: "QRZ_HTTP" };
    const root = parser.parse(xml) as Record<string, unknown>;
    const database = root.QRZDatabase as Record<string, unknown> | undefined;
    const session = database?.Session as Record<string, unknown> | undefined;
    const error = asString(session?.Error) || asString((database?.Error as Record<string, unknown> | undefined)?.Message);
    if (/session|not logged/iu.test(error)) return { status: "unavailable", requested_call: requested, resolved_call: null, email: null, error_code: "SESSION_INVALID" };
    if (/subscription|not authorized/iu.test(error)) return { status: "subscription_required", requested_call: requested, resolved_call: null, email: null, error_code: "QRZ_SUBSCRIPTION_REQUIRED" };
    const callsign = database?.Callsign as Record<string, unknown> | undefined;
    if (!callsign) return { status: "no_email", requested_call: requested, resolved_call: null, email: null, error_code: "QRZ_NO_CALL" };
    const email = asString(callsign.email).trim().toLowerCase();
    return { status: email.includes("@") ? "ready" : "no_email", requested_call: requested, resolved_call: asString(callsign.call) || requested, email: email.includes("@") ? email : null, error_code: email.includes("@") ? undefined : "QRZ_NO_EMAIL" };
  }

  private endpoint(): string { const endpoint = this.options.endpoint ?? "https://xmldata.qrz.com/xml/1.34/"; if (!endpoint.startsWith("https://")) throw new Error("QRZ_ENDPOINT_MUST_BE_HTTPS"); return endpoint; }
  private fetcher(): FetchLike { return this.options.fetcher ?? fetch; }
  private async readBody(response: Response): Promise<string> { const text = await response.text(); if (new TextEncoder().encode(text).byteLength > 256 * 1024) throw new Error("QRZ_RESPONSE_TOO_LARGE"); return text; }
}
