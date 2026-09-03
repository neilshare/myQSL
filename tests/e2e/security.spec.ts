import { test, expect } from "@playwright/test";
test("health endpoint is reachable without owner identity", async ({ request }) => { const response = await request.get("/healthz"); expect(response.status()).toBe(200); });
