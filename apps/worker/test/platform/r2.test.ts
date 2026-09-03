import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MediaStore } from "../../src/platform/r2";

describe("MediaStore", () => {
  it("writes immutable objects and returns the existing object on repeat writes", async () => {
    const media = new MediaStore(env.MEDIA);
    const first = await media.putImmutable("test/immutable.txt", "hello", "text/plain");
    const second = await media.putImmutable("test/immutable.txt", "different", "text/plain");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await (await env.MEDIA.get("test/immutable.txt"))?.text()).toBe("hello");
  });
});
