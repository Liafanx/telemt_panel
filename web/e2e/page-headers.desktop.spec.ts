import { test, expect } from "./fixtures";

const pages = [
  "/overview", "/people", "/journal", "/pulse", "/server",
  "/server/settings", "/server/config", "/server/platform", "/server/security", "/server/updates",
  "/pulse/diag/connections", "/pulse/diag/dc", "/pulse/diag/me", "/pulse/diag/upstreams",
  "/pulse/diag/nat", "/pulse/diag/security", "/pulse/diag/events", "/pulse/diag/counters",
  "/web", "/people/alice", "/people?create=true", "/people?schedule=true",
  "/people/a-very-long-user-name-that-must-wrap-without-covering-page-actions-or-navigation",
];

for (const locale of ["ru", "en"] as const) {
  test.describe(locale, () => {
    test.use({ uiLocale: locale });
    test(`page headings share typography, alignment and responsive actions (${locale})`, async ({ page, login }, testInfo) => {
      test.setTimeout(180_000);
      await login();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const width of [390, 768, 1280, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of pages) {
          await page.goto(path);
          const heading = page.locator("main h1");
          await expect(heading, path).toHaveCount(1);
          if (path === "/overview") await expect(heading).toHaveText(locale === "ru" ? "Сводка" : "Overview");
          await expect(heading, path).toHaveCSS("font-size", width < 768 ? "22px" : "26px");
          await expect(heading, path).toHaveCSS("font-weight", "800");
          const header = page.getByTestId("page-header");
          await expect(header, path).toBeVisible();
          await expect(header, path).not.toContainText(/Загрузка|Loading/);
          if (path === "/people") await expect(page.getByTestId("user-card-alice")).toBeVisible();
          await expect(header, path).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          const box = (await header.boundingBox())!;
          const title = (await heading.boundingBox())!;
          expect(Math.abs(title.x - box.x), path).toBeLessThan(1);
          // The heading is outside the content card, at the common page gutter.
          expect(box.x, path).toBe(width >= 1180 ? 256 : width >= 600 ? 80 : 16);
          expect(box.x + box.width, path).toBeLessThanOrEqual(width - 15);
          const clipping = await header.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return [...element.querySelectorAll("h1, button, a")].some(child => {
              const rect = child.getBoundingClientRect();
              return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
            });
          });
          expect(clipping, path).toBe(false);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(1);
          if (["/overview", "/people", "/journal", "/pulse/diag/connections", "/server/settings"].includes(path)) {
            await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll("/", "-")}-${width}.png`) });
          }
        }
      }
      expect(errors).toEqual([]);
    });
  });
}
