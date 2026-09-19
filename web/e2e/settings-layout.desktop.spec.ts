import { test, expect } from "./fixtures";

test("panel settings fill both desktop columns and stack access before appearance on mobile", async ({ page, login }, testInfo) => {
  await login();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const width of [1280, 2560, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/server/settings");
    const sessions = page.getByTestId("settings-sessions");
    const transport = page.getByTestId("panel-transport");
    const subscription = page.getByTestId("subscription-transport");
    const appearance = page.getByTestId("settings-interface");
    const passkeys = page.locator("section").filter({
      has: page.getByRole("button", { name: "Добавить passkey", exact: true }),
    });
    await expect(sessions).toContainText("Это устройство");
    await expect(transport).toBeVisible();
    await expect(appearance).toBeVisible();
    const sessionBox = (await sessions.boundingBox())!;
    const passkeyBox = (await passkeys.boundingBox())!;
    const transportBox = (await transport.boundingBox())!;
    const subscriptionBox = (await subscription.boundingBox())!;
    const appearanceBox = (await appearance.boundingBox())!;

    // A short session list must not leave an empty column beside all settings.
    expect(Math.abs(transportBox.x - sessionBox.x)).toBeLessThan(2);
    expect(passkeyBox.y - (sessionBox.y + sessionBox.height)).toBeGreaterThanOrEqual(0);
    expect(passkeyBox.y - (sessionBox.y + sessionBox.height)).toBeLessThan(24);
    expect(transportBox.y).toBeGreaterThan(passkeyBox.y);
    expect(subscriptionBox.y).toBeGreaterThan(transportBox.y);
    if (width >= 1024) {
      expect(appearanceBox.x).toBeGreaterThan(sessionBox.x + sessionBox.width);
      expect(Math.abs(appearanceBox.y - sessionBox.y)).toBeLessThan(2);
      expect(Math.abs(appearanceBox.width - sessionBox.width)).toBeLessThan(2);
    } else {
      expect(Math.abs(appearanceBox.x - sessionBox.x)).toBeLessThan(2);
      expect(appearanceBox.y).toBeGreaterThan(subscriptionBox.y + subscriptionBox.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
