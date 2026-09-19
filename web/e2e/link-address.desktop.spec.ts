import { test, expect } from "./fixtures";
import QRCode from "qrcode";

for (const width of [390, 1280]) {
  test(`Access address selection is optional and isolated (${width}px)`, async ({
    page,
    login,
  }, testInfo) => {
    await login();
    await page.setViewportSize({ width, height: 960 });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const secret = "0123456789abcdef0123456789abcdef";
    const primary = `tg://proxy?server=rr.example&port=8443&secret=ee${secret}${Buffer.from("mask.example").toString("hex")}`;
    const web = `tg://webproxy?server=web.example&secret=${secret}`;
    let configReads = 0;
    let eeEnabled = true;
    let configUnavailable = false;
    let extraDomains = ["node.example", "other.example", "node.example"];
    let holdConfig: Promise<void> | undefined;
    let releaseConfig: (() => void) | undefined;
    await page.route("**/api/telemt/config", async (route) => {
      configReads++;
      await holdConfig;
      if (configUnavailable)
        return route.fulfill({
          status: 502,
          json: { code: "telemt_unreachable", message: "test unavailable" },
        });
      return route.fulfill({
        json: {
          revision: "test",
          sections: {
            censorship: {
              tls_domain: "mask.example",
              tls_domains: extraDomains,
            },
          },
        },
      });
    });
    await page.route("**/api/telemt/web-access", (route) =>
      route.fulfill({
        json: {
          revision: "test",
          enabled: true,
          vhosts: [
            {
              host: "web.example",
              public_addr: "198.51.100.1:443",
              profiles: [{ user: "alice", secret_mode: "plain" }],
            },
          ],
        },
      }),
    );
    await page.route("**/api/events?*", async (route) => {
      const snapshot = await (await page.request.get("/api/snapshot?topics=users,stats")).json();
      const alice = snapshot.users.users.find((u: { username: string }) => u.username === "alice");
      alice.links = {
        classic: [],
        secure: [`tg://proxy?server=rr.example&port=8443&secret=dd${secret}`],
        tls: eeEnabled ? [primary] : [],
        tls_domains: [],
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
    await page.goto("/server/settings");
    const toggle = page.getByRole("switch", { name: "Разрешить выбор адреса подключения" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.goto("/people/alice?tab=access");
    const address = page.getByRole("combobox", { name: "Адрес подключения", exact: true });
    await expect(page.getByRole("button", { name: "Копировать tg://", exact: true })).toBeVisible();
    await expect(address).toHaveCount(0);
    expect(configReads).toBe(0);
    await page.goto("/server/settings");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    try {
      await page.reload();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await page.goto("/people/alice?tab=access");
      await expect(address).toHaveValue("");
      await expect(address.locator("option")).toHaveCount(3);
      await address.selectOption("node.example");
      const subscription = await page.getByTestId("sublink-value").innerText();
      await page.getByRole("button", { name: "Копировать tg://", exact: true }).click();
      const selected = primary.replace("server=rr.example", "server=node.example");
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(selected);
      await page.getByRole("button", { name: "Копировать t.me", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(selected.replace("tg://proxy?", "https://t.me/proxy?"));
      await page.getByRole("button", { name: "QR", exact: true }).click();
      await expect(
        page.locator(".user-link-details").locator("..").locator("svg").last(),
      ).toBeVisible();
      const expectedSVG = await QRCode.toString(selected, { type: "svg", margin: 1, width: 160 });
      const expectedPaths = [...expectedSVG.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(
        (match) => match[1],
      );
      await expect
        .poll(() =>
          page
            .locator(".user-link-details")
            .locator("..")
            .locator("svg")
            .last()
            .locator("path")
            .evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
        )
        .toEqual(expectedPaths);
      await expect(page.getByTestId("sublink-value")).toHaveText(subscription);
      await page.screenshot({
        path: testInfo.outputPath(`access-address-${width}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Копировать EE · alice", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(primary.replace("tg://proxy?", "https://t.me/proxy?"));
      await page.getByRole("button", { name: "WEB", exact: true }).click();
      await expect(address).toHaveCount(0);
      await page.getByRole("button", { name: "Копировать WEB", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(web);
      await page.getByRole("button", { name: "EE", exact: true }).click();
      await expect(address).toHaveValue("");
      await address.selectOption("other.example");
      await page.getByRole("button", { name: "Обзор", exact: true }).click();
      extraDomains = ["other.example"];
      const before = configReads;
      holdConfig = new Promise<void>((resolve) => {
        releaseConfig = resolve;
      });
      await page.getByRole("button", { name: "Доступ", exact: true }).click();
      await expect.poll(() => configReads).toBeGreaterThan(before);
      await expect(address).toBeDisabled();
      releaseConfig!();
      await expect(address).toHaveValue("");
      await expect(address.locator("option")).toHaveCount(2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      eeEnabled = false;
      extraDomains = ["node.example", "other.example"];
      await page.reload();
      await expect(page.getByRole("button", { name: "DD", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await address.selectOption("node.example");
      await page.getByRole("button", { name: "Копировать tg://", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(`tg://proxy?server=node.example&port=8443&secret=dd${secret}`);
      configUnavailable = true;
      await page.reload();
      await expect(address).toBeDisabled();
      await expect(
        page.getByText("Не удалось получить список доменов. Используется исходный адрес Telemt.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Копировать tg://", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(`tg://proxy?server=rr.example&port=8443&secret=dd${secret}`);
    } finally {
      releaseConfig?.();
      await page.request.put("/api/settings/links", {
        headers: { "Sec-Fetch-Site": "same-origin" },
        data: { allow_address_override: false },
      });
    }
  });
}

test("Access waits for fresh settings instead of reusing cached permission", async ({
  page,
  login,
}) => {
  await login();
  let enabled = true;
  let settingsReads = 0;
  let hold = Promise.resolve();
  let release: (() => void) | undefined;
  await page.route("**/api/settings/links", async (route) => {
    settingsReads++;
    await hold;
    await route.fulfill({ json: { allow_address_override: enabled } });
  });
  await page.route("**/api/telemt/config", (route) =>
    route.fulfill({
      json: { revision: "test", sections: { censorship: { tls_domains: ["node.example"] } } },
    }),
  );
  await page.goto("/people/alice?tab=access");
  const address = page.getByRole("combobox", { name: "Адрес подключения", exact: true });
  await expect(address).toBeEnabled();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  const before = settingsReads;
  enabled = false;
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await page.getByRole("button", { name: "Доступ", exact: true }).click();
    await expect(address).toHaveCount(0);
    await expect.poll(() => settingsReads).toBeGreaterThan(before);
    release!();
    await expect(page.getByRole("button", { name: "Копировать tg://", exact: true })).toBeVisible();
    await expect(address).toHaveCount(0);
  } finally {
    release?.();
  }
});
