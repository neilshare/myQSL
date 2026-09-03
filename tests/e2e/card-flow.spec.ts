import { test, expect } from "@playwright/test";
test("owner can open card templates", async ({ page }) => { await page.goto("/admin/templates"); await expect(page.getByText("QSL 模板")).toBeVisible(); });
