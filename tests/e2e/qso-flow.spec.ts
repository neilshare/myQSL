import { test, expect, createTestStation } from "./fixtures";

test.describe("QSO user journey", () => {
  test("creates QSO, verifies in list, tests 412 optimistic locking on concurrent edit, moves to trash, and restores", async ({
    authedPage,
    authedRequest
  }) => {
    // Ensure default station exists
    await createTestStation(authedRequest, { callsign: "BI1ABC" }).catch(() => {});

    // 1. Navigate to QSO workbench
    await authedPage.goto("/admin/qsos");
    await expect(authedPage.getByRole("heading", { name: "QSO 日志" })).toBeVisible();

    // 2. Fill in QSO form
    const uniqueCall = `BG${Date.now().toString().slice(-4)}E2E`;
    const form = authedPage.getByRole("form", { name: "QSO 表单" });
    await form.getByLabel("对方呼号").fill(uniqueCall);
    await form.getByLabel("本台呼号").fill("BI1ABC");
    await form.getByLabel("UTC 日期").fill("20260904");
    await form.getByLabel("UTC 时间").fill("103000");
    await form.getByLabel("波段").fill("20M");
    await form.getByLabel("模式").fill("SSB");

    // Save QSO
    await form.getByRole("button", { name: "保存" }).click();
    await expect(form.getByRole("status")).toContainText("已保存");

    // 3. Verify visible in list
    const qsoArticle = authedPage.locator("article", { hasText: uniqueCall });
    await expect(qsoArticle).toBeVisible();
    await expect(qsoArticle).toContainText("20260904");
    await expect(qsoArticle).toContainText("20M / SSB");

    // 4. Test 412 Precondition Failed (optimistic locking)
    // First, click "编辑" to open edit dialog with current ETag
    await qsoArticle.getByRole("button", { name: "编辑" }).click();
    const editModal = authedPage.getByRole("dialog", { name: "编辑 QSO" });
    await expect(editModal).toBeVisible();

    // In the background, fetch this QSO to get its ID and current ETag, then mutate it via API
    const listRes = await authedRequest.get(`/api/v1/qsos?call=${uniqueCall}`);
    const listData = (await listRes.json()) as { data: Array<{ id: number; version: number; call: string }> };
    const qsoRecord = listData.data.find((r) => r.call === uniqueCall) ?? listData.data[0];
    expect(qsoRecord).toBeDefined();

    // Concurrent modification via API: increments version from v1 to v2
    const currentEtag = `W/"qso-${qsoRecord.id}-${qsoRecord.version}"`;
    const patchRes = await authedRequest.patch(`/api/v1/qsos/${qsoRecord.id}`, {
      headers: { "If-Match": currentEtag },
      data: { comment: "Concurrent modification in background" }
    });
    expect(patchRes.status()).toBe(200);

    // Now, in the browser UI, change a field and submit using the stale form (still has v1 ETag)
    await editModal.getByLabel("模式").fill("CW");
    await editModal.getByRole("button", { name: "保存" }).click();

    // Verify 412 / stale error feedback appears in UI
    await expect(editModal.getByRole("status")).toContainText(/stale|changed|Precondition/i);

    // Cancel edit dialog
    await editModal.getByRole("button", { name: "取消编辑" }).click();
    await expect(editModal).not.toBeVisible();

    // 5. Delete to trash
    await authedPage.reload();
    const reloadedArticle = authedPage.locator("article", { hasText: uniqueCall });
    await expect(reloadedArticle).toBeVisible();
    await reloadedArticle.getByRole("button", { name: "删除" }).click();

    // Verify removed from active list
    await expect(authedPage.locator("article", { hasText: uniqueCall })).not.toBeVisible();

    // 6. Navigate to trash page and restore
    await authedPage.goto("/admin/trash");
    await expect(authedPage.getByRole("heading", { name: "回收站" })).toBeVisible();
    const trashArticle = authedPage.locator("article", { hasText: uniqueCall });
    await expect(trashArticle).toBeVisible();

    // Click "恢复"
    await trashArticle.getByRole("button", { name: "恢复" }).click();
    await expect(authedPage.getByRole("status")).toContainText("已成功恢复");

    // 7. Verify back in active list
    await authedPage.goto("/admin/qsos");
    await expect(authedPage.locator("article", { hasText: uniqueCall })).toBeVisible();
  });
});
