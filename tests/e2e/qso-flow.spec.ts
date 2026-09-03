import { test, expect } from "@playwright/test";
test("owner can open the QSO workbench", async ({ page }) => { await page.goto("/admin/qsos"); await expect(page.getByText("QSO 日志")).toBeVisible(); });
