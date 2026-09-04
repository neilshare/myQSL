import { describe, expect, it } from "vitest";
import { problem } from "../../src/platform/problem";

describe("Problem Details", () => {
  it("returns RFC 9457-compatible JSON and disables caching", async () => {
    const response = problem(422, "https://myqsl.app/problems/invalid", "Invalid request", "bad input", "/api");
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ type: "https://myqsl.app/problems/invalid", status: 422 });
  });
});
