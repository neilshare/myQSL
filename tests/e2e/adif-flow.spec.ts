import { test, expect } from "@playwright/test";
test("owner can open ADIF import", async ({ page }) => { await page.goto("/admin/import"); await expect(page.getByText("ADIF 导入")).toBeVisible(); });
