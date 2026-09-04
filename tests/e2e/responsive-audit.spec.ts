import { test, expect, createTestStation } from "./fixtures";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "pad", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 667 }
];

const PAGES = [
  { path: "/admin/qsos", name: "admin-qsos" },
  { path: "/admin/templates/edit", name: "admin-template-edit" },
  { path: "/admin/cards/new", name: "admin-card-new" },
  { path: "/admin/cards", name: "admin-cards" },
  { path: "/admin/templates", name: "admin-templates" },
  { path: "/admin/settings/stations", name: "admin-stations" },
  { path: "/admin/import", name: "admin-import" },
  { path: "/admin/trash", name: "admin-trash" },
  { path: "/lookup", name: "public-lookup" }
];

test.describe("Responsive Multi-Platform Audit", () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:8787",
      extraHTTPHeaders: {
        "X-MYQSL-Test-Actor": "e2e-owner",
        "Authorization": "Bearer local-e2e-owner",
        "Origin": "http://127.0.0.1:8787"
      }
    });
    await createTestStation(request, { callsign: "BI1ABC" }).catch(() => {});
    await request.dispose();
  });

  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      test(`Audit ${pg.name} on ${vp.name} (${vp.width}x${vp.height})`, async ({ authedPage }) => {
        await authedPage.setViewportSize({ width: vp.width, height: vp.height });
        await authedPage.goto(pg.path, { waitUntil: "networkidle" });

        // Screenshot for inspection
        const screenshotPath = `/Users/zhangneil/.gemini/antigravity/brain/42f60b49-2615-4bef-818c-d8000a1d5bd3/screenshots/${pg.name}-${vp.name}.png`;
        await authedPage.screenshot({ path: screenshotPath, fullPage: true });

        // Check horizontal overflow
        const overflow = await authedPage.evaluate(() => {
          const doc = document.documentElement;
          const scrollWidth = doc.scrollWidth;
          const clientWidth = doc.clientWidth;
          const innerWidth = window.innerWidth;
          
          // Find elements causing overflow if any
          const overflowingElements: Array<{ tag: string; id: string; className: string; scrollWidth: number; offsetWidth: number; right: number }> = [];
          if (scrollWidth > innerWidth + 1) {
            const all = document.querySelectorAll("*");
            for (const el of Array.from(all)) {
              const rect = el.getBoundingClientRect();
              if (rect.right > innerWidth + 1) {
                overflowingElements.push({
                  tag: el.tagName,
                  id: el.id,
                  className: el.className,
                  scrollWidth: (el as HTMLElement).scrollWidth,
                  offsetWidth: (el as HTMLElement).offsetWidth,
                  right: Math.round(rect.right)
                });
              }
            }
          }

          return {
            scrollWidth,
            clientWidth,
            innerWidth,
            hasOverflow: scrollWidth > innerWidth + 1,
            overflowingElements: overflowingElements.slice(0, 5)
          };
        });

        console.log(`[AUDIT] ${pg.name} on ${vp.name}: hasOverflow=${overflow.hasOverflow} (scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth})`);
        if (overflow.hasOverflow) {
          console.log(`[AUDIT_OVERFLOW] Elements:`, JSON.stringify(overflow.overflowingElements));
        }
        expect(overflow.hasOverflow).toBe(false);
      });
    }
  }
});
