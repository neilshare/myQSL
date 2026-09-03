import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src";

describe("opaque QSO cursors", () => {
  it("round trips the exact payload", () => {
    const encoded = encodeCursor({ qso_at: 1_757_000_000_000, id: 42 });
    expect(decodeCursor(encoded)).toEqual({ qso_at: 1_757_000_000_000, id: 42 });
  });

  it("rejects malformed, extra-key and negative payloads", () => {
    expect(() => decodeCursor("not-base64")).toThrow();
    const extra = Buffer.from(JSON.stringify({ qso_at: 1, id: 1, x: 2 })).toString("base64url");
    expect(() => decodeCursor(extra)).toThrow();
    const negative = Buffer.from(JSON.stringify({ qso_at: 1, id: -1 })).toString("base64url");
    expect(() => decodeCursor(negative)).toThrow();
  });
});
