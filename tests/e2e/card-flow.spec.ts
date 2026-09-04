import { test, expect, createTestStation, createTestQso, createTestTemplate, uploadTestBackground } from "./fixtures";

test.describe("Card creation, publication, and verification lifecycle", () => {
  test("designs template with background, generates & publishes card, verifies via public URL and lookup, then voids to 410", async ({
    authedPage,
    authedRequest,
    page: publicPage,
    request: publicRequest
  }) => {
    // 1. Prepare prerequisites
    await createTestStation(authedRequest, { callsign: "BI1ABC" }).catch(() => {});
    const uniqueCall = `BD${Date.now().toString().slice(-4)}CD`;
    const qso = await createTestQso(authedRequest, {
      call: uniqueCall,
      station_callsign: "BI1ABC",
      qso_date: "20260904",
      time_on: "083000",
      band: "20M",
      mode: "FT8"
    });

    const templateName = `E2E 模板 ${uniqueCall}`;
    const template = await createTestTemplate(authedRequest, templateName);
    await uploadTestBackground(authedRequest, template.id);

    // 2. Navigate to Card Generator UI
    await authedPage.goto("/admin/cards/new");
    await expect(authedPage.getByRole("heading", { name: "生成 QSL 卡片" })).toBeVisible();

    // Select QSO and Template
    await authedPage.getByLabel("选择 QSO").selectOption(String(qso.id));
    await authedPage.getByLabel("选择模板").selectOption(String(template.id));

    // Click Generate & Publish
    await authedPage.getByRole("button", { name: "生成并发布卡片" }).click();

    // Wait for publication completion
    await expect(authedPage.getByRole("status")).toContainText("卡片已发布", { timeout: 15_000 });
    const successBox = authedPage.locator(".card-result");
    await expect(successBox).toBeVisible();

    // Extract public link
    const linkEl = successBox.locator("a");
    const href = await linkEl.getAttribute("href");
    expect(href).toMatch(/^\/c\/[A-Za-z0-9_-]+$/);
    const publicId = href!.replace("/c/", "");

    // 3. Browser directly visits /c/{publicId} (Unauthenticated public user)
    await publicPage.goto(`/c/${publicId}`);
    await expect(publicPage.getByRole("heading", { name: "电子 QSL 卡片查验" })).toBeVisible();
    await expect(publicPage.getByText("已认证签发")).toBeVisible();
    await expect(publicPage.getByText(uniqueCall)).toBeVisible();
    await expect(publicPage.getByText("20260904 083000")).toBeVisible();
    const cardImg = publicPage.locator(`img[alt='${uniqueCall} QSL']`);
    await expect(cardImg).toBeVisible();

    // 4. Verification via exact lookup (/lookup)
    await publicPage.goto("/lookup");
    await expect(publicPage.getByRole("heading", { name: /查验与精确索卡/ })).toBeVisible();
    await publicPage.locator("#call-input").fill(uniqueCall);
    await publicPage.locator("#date-input").fill("20260904");
    await publicPage.getByRole("button", { name: "查询 / 索卡" }).click();

    const lookupResult = publicPage.locator(".lookup-result, article, div", { hasText: uniqueCall });
    await expect(lookupResult.first()).toBeVisible({ timeout: 10_000 });
    await expect(publicPage.getByText("查看完整电子 QSL 卡片 →")).toBeVisible();

    // 5. Void the card in backend
    // Fetch card record id
    const cardsListRes = await authedRequest.get("/api/v1/cards");
    const cardsListData = (await cardsListRes.json()) as { data: Array<{ id: string; public_id: string; status: string }> };
    const targetCard = cardsListData.data.find((c) => c.public_id === publicId);
    expect(targetCard).toBeDefined();

    const voidRes = await authedRequest.post(`/api/v1/cards/${targetCard!.id}/void`);
    expect(voidRes.status()).toBe(200);

    // 6. Verify 410 Gone on both public page and API
    // Direct public API check returns 410
    const publicApiRes = await publicRequest.get(`/api/v1/public/cards/${publicId}`);
    expect(publicApiRes.status()).toBe(410);

    // Public web page visiting the voided card shows void notice
    await publicPage.goto(`/c/${publicId}`);
    await expect(publicPage.getByRole("alert")).toContainText("该 QSL 卡片已作废 (Voided)");
  });
});
