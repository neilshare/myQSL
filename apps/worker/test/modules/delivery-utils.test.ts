import { describe, expect, it } from "vitest";
import { decryptContact, encryptContact, hashRecipient, maskEmail } from "../../src/platform/pii";
import { FakeEmailProvider, ResendProvider } from "../../src/modules/deliveries/provider";
import { verifyWebhookSignature } from "../../src/modules/deliveries/webhook";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe("delivery security utilities", () => {
  it("encrypts contact data and never returns plaintext in the stored object", async () => {
    const encrypted = await encryptContact("operator@example.com", "v1", key);
    expect(JSON.stringify(encrypted)).not.toContain("operator@example.com");
    await expect(decryptContact(encrypted, key)).resolves.toBe("operator@example.com");
    await expect(decryptContact(encrypted, btoa(String.fromCharCode(...new Uint8Array(32).fill(8))))).rejects.toThrow();
    expect(maskEmail("operator@example.com")).toMatch(/^o\*+r@example\.com$/u);
    expect(await hashRecipient("Operator@Example.com", key)).toBe(await hashRecipient("operator@example.com", key));
  });

  it("uses provider idempotency and validates attachment limits", async () => {
    const provider = new FakeEmailProvider();
    const envelope = { delivery_id: "d1", to: "a@example.com", from: "qsl@example.com", subject: "QSL", html: "<p>hello</p>" };
    await provider.send(envelope, "d1"); await provider.send(envelope, "d1"); expect(provider.sent).toHaveLength(1);
    const resend = new ResendProvider({ apiKey: "key", from: "qsl@example.com", fetcher: async () => new Response(JSON.stringify({ id: "p1" }), { status: 200, headers: { "x-request-id": "r1" } }) });
    await expect(resend.send({ ...envelope, attachment: { filename: "card.png", content: new Uint8Array(5 * 1024 * 1024 + 1), content_type: "image/png" } }, "d1")).rejects.toThrow(/5 MiB/iu);
  });

  it("verifies the raw webhook signature and rejects stale timestamps", async () => {
    const body = JSON.stringify({ type: "email.delivered" }); const id = "msg_1"; const timestamp = String(Math.floor(Date.now() / 1000));
    const keyData = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", keyData, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))));
    const headers = new Headers({ "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` });
    await expect(verifyWebhookSignature(body, headers, "secret")).resolves.toBe(true);
    await expect(verifyWebhookSignature(body, headers, "bad")).resolves.toBe(false);
    await expect(verifyWebhookSignature(body, new Headers({ "svix-id": id, "svix-timestamp": "1", "svix-signature": `v1,${signature}` }), "secret")).resolves.toBe(false);
  });
});
