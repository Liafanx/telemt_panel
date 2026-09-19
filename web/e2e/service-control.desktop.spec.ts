import { test, expect } from "./fixtures";

for (const width of [320, 390, 1280]) {
  test(`Telemt service control uses host state, exact actions and explicit confirmation (${width}px)`, async ({
    page,
    login,
  }, testInfo) => {
    await login();
    await page.setViewportSize({ width, height: 950 });
    let state = "stopped",
      supported = true,
      busy = false,
      manual = false,
      unconfirmed = false;
    const actions: string[] = [];
    await page.route("**/api/telemt/service", (route) =>
      route.fulfill({
        json: {
          service: "telemt-test",
          manager: "systemd",
          status: state,
          status_supported: supported,
          binding_conflict: false,
          busy,
          caps: { start: !manual, stop: !manual, restart: !manual },
          manual_commands: manual
            ? {
                start: "systemctl start telemt-test",
                stop: "systemctl stop telemt-test",
                restart: "systemctl restart telemt-test",
              }
            : {},
        },
      }),
    );
    for (const action of ["start", "stop", "restart"])
      await page.route(`**/api/telemt/${action}`, (route) => {
        actions.push(action);
        if (unconfirmed)
          return route.fulfill({
            status: 502,
            json: { code: "service_action_unconfirmed", message: "test timeout" },
          });
        state = action === "stop" ? "stopped" : "running";
        return route.fulfill({ status: 202 });
      });
    await page.goto("/server/platform");
    const card = page.getByTestId("telemt-service-control");
    await expect(card).toContainText("Остановлен");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: testInfo.outputPath(`service-control-${width}.png`) });
    await card.getByRole("button", { name: "Запустить", exact: true }).click();
    const dialog = page.getByRole("dialog");
    expect(actions).toEqual([]);
    await dialog.getByRole("button", { name: "Запустить Telemt", exact: true }).click();
    await expect(card).toContainText("Работает");
    expect(actions).toEqual(["start"]);
    await card.getByRole("button", { name: "Остановить", exact: true }).click();
    await expect(dialog).toContainText("подключения");
    expect(actions).toEqual(["start"]);
    await dialog.getByRole("button", { name: "Остановить Telemt", exact: true }).click();
    await expect(card).toContainText("Остановлен");
    expect(actions).toEqual(["start", "stop"]);
    state = "unknown";
    supported = false;
    await page.reload();
    await expect(card).toContainText("Статус неизвестен");
    await expect(card.getByRole("button", { name: "Запустить", exact: true })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Остановить", exact: true })).toBeEnabled();
    await card.getByRole("button", { name: "Остановить", exact: true }).click();
    await expect(dialog).toContainText("Статус неизвестен");
    await page.keyboard.press("Escape");
    expect(actions).toHaveLength(2);
    busy = true;
    await page.reload();
    await expect(card.getByRole("button", { name: "Запустить", exact: true })).toBeDisabled();
    busy = false;
    manual = true;
    await page.reload();
    await card.getByRole("button", { name: "Запустить", exact: true }).click();
    await expect(dialog).toContainText("systemctl start telemt-test");
    await expect(dialog.getByRole("button", { name: "Запустить Telemt", exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    expect(actions).toHaveLength(2);
    manual = false;
    unconfirmed = true;
    await page.reload();
    await card.getByRole("button", { name: "Запустить", exact: true }).click();
    await dialog.getByRole("button", { name: "Запустить Telemt", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(card).toContainText("Статус неизвестен");
    expect(actions).toHaveLength(3);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  });
}
