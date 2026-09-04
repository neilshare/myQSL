import { test, expect, createTestStation, createTestQso, createTestTemplate, uploadTestBackground } from "./fixtures";

test.describe("Security boundaries and authorization enforcement", () => {
  test("public endpoints are accessible without auth", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  test("protected management APIs reject unauthenticated requests with 401", async ({ request }) => {
    const protectedPaths = [
      "/readyz",
      "/api/v1/qsos",
      "/api/v1/stations",
      "/api/v1/cards",
      "/api/v1/card-templates",
      "/api/v1/backups"
    ];

    for (const path of protectedPaths) {
      const res = await request.get(path);
      expect(res.status(), `Expected 401 on ${path}`).toBe(401);
      const json = (await res.json()) as { status: number; type: string };
      expect(json.status).toBe(401);
      expect(json.type).toContain("problems/auth-required");
    }
  });

  test("readyz is accessible when authenticated as owner", async ({ authedRequest }) => {
    const res = await authedRequest.get("/readyz");
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { status: string; d1: string };
    expect(json.status).toBe("ready");
    expect(json.d1).toBe("connected");
  });

  test("unpublished draft and ready cards return 404 on public endpoints", async ({
    authedRequest,
    request: unauthRequest
  }) => {
    // 1. Create station, QSO, and template
    await createTestStation(authedRequest, { callsign: "BI1ABC" }).catch(() => {});
    const qso = await createTestQso(authedRequest);
    const template = await createTestTemplate(authedRequest, "Security Test Template");
    await uploadTestBackground(authedRequest, template.id);

    // 2. Create a draft card (not published)
    const createRes = await authedRequest.post("/api/v1/cards", {
      data: { qso_id: qso.id, template_id: template.id }
    });
    expect(createRes.status()).toBe(201);
    const cardData = (await createRes.json()) as { data: { id: string; public_id: string; status: string } };
    const draftCard = cardData.data;
    expect(draftCard.status).toBe("draft");

    // 3. Direct unauthenticated request to /api/v1/public/cards/:publicId returns 404
    const draftPublicRes = await unauthRequest.get(`/api/v1/public/cards/${draftCard.public_id}`);
    expect(draftPublicRes.status()).toBe(404);

    const draftImageRes = await unauthRequest.get(`/api/v1/public/cards/${draftCard.public_id}/image`);
    expect(draftImageRes.status()).toBe(404);

    // 4. Attach image to move to 'ready' status (still not published)
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const attachRes = await authedRequest.put(`/api/v1/cards/${draftCard.id}/image`, {
      headers: { "Content-Type": "image/png" },
      data: pngBuffer
    });
    expect(attachRes.status()).toBe(200);

    // 5. Direct unauthenticated request to ready card still returns 404
    const readyPublicRes = await unauthRequest.get(`/api/v1/public/cards/${draftCard.public_id}`);
    expect(readyPublicRes.status()).toBe(404);

    const readyImageRes = await unauthRequest.get(`/api/v1/public/cards/${draftCard.public_id}/image`);
    expect(readyImageRes.status()).toBe(404);
  });
});
