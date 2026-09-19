import { test, expect } from "./fixtures";

test("overview and upstream details show runtime routes with minimal stats disabled", async ({
  page,
  login,
}) => {
  await login();
  await page.route("**/api/events?*", async (route) => {
    const snapshot = await (
      await page.request.get("/api/snapshot?topics=runtime,upstreams,stats")
    ).json();
    const stats = snapshot.upstreams.upstreams;
    snapshot.runtime.upstream_quality = {
      ...snapshot.runtime.upstream_quality,
      enabled: true,
      summary: { ...stats.summary, direct_total: 0, socks5_total: 1 },
      upstreams: stats.upstreams.map((row: Record<string, unknown>) => ({
        ...row,
        route_kind: "socks5",
        effective_latency_ms: 42,
      })),
    };
    snapshot.upstreams.upstreams = {
      ...stats,
      enabled: false,
      reason: "feature_disabled",
      summary: undefined,
      upstreams: undefined,
    };
    const ts = Math.floor(Date.now() / 1000);
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        "retry: 60000\n\n" +
        Object.entries(snapshot)
          .map(([topic, v]) => `event: ${topic}\ndata: ${JSON.stringify({ ts, v })}\n\n`)
          .join(""),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/overview");
    const card = page.getByTestId("upstreams-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("SOCKS5");
    await expect(card).toContainText("42");
    const widget = card.locator("..");
    await expect(widget).not.toContainText("feature_disabled");
    await expect(widget).not.toContainText("Выключено");
    await widget.getByTestId("widget-action").click();
    await expect(page).toHaveURL(/\/pulse\/diag\/upstreams$/);
    await expect(page.getByTestId("upstreams-routes")).toContainText(/socks5/i);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
