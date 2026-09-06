import { describe, expect, it, vi } from "vitest";
import { QrzClient } from "../../src/modules/directory/client";

describe("QRZ directory client", () => {
  it("single-flights login and parses an email without exposing session in errors", async () => {
    const responses = [
      new Response("<QRZDatabase><Session><Key>session-key</Key></Session></QRZDatabase>", { status: 200 }),
      new Response("<QRZDatabase><Callsign><call>K1ABC</call><email>operator@example.com</email></Callsign></QRZDatabase>", { status: 200 }),
      new Response("<QRZDatabase><Callsign><call>K1ABC</call><email>operator@example.com</email></Callsign></QRZDatabase>", { status: 200 })
    ];
    const fetcher = vi.fn(async () => responses.shift()!);
    const client = new QrzClient({ username: "user", password: "pass", fetcher });
    const [first, second] = await Promise.all([client.lookup("K1ABC"), client.lookup("K1ABC")]);
    expect(first.status).toBe("ready"); expect(first.email).toBe("operator@example.com"); expect(second.status).toBe("ready"); expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("maps subscription and missing email responses to stable codes", async () => {
    const subscription = new QrzClient({ username: "u", password: "p", fetcher: async () => new Response("<QRZDatabase><Session><Key>k</Key></Session></QRZDatabase>") });
    expect((await subscription.lookup("bad!" as string)).error_code).toBe("INVALID_CALL");
    const missing = new QrzClient({ username: "u", password: "p", fetcher: async (input, init) => new Response(String(init?.body).includes("username") ? "<QRZDatabase><Session><Key>k</Key></Session></QRZDatabase>" : "<QRZDatabase><Callsign><call>K1ABC</call></Callsign></QRZDatabase>") });
    await expect(missing.lookup("K1ABC")).resolves.toMatchObject({ status: "no_email", error_code: "QRZ_NO_EMAIL" });
  });
});
