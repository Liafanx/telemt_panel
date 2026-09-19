import { test, expect } from "./fixtures";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1280]) {
  test(`passkey name keeps focus through controlled input updates (${width}px)`, async ({
    page,
    login,
  }) => {
    await login();
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/server/settings");
    const errors: string[] = [];
    const registrations: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.includes("/webauthn/register/"))
        registrations.push(request.method());
    });
    const trigger = page.getByRole("button", { name: "Добавить passkey", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Добавить passkey", exact: true });
    const input = dialog.getByLabel("Название passkey", { exact: true });
    await expect(input).toBeFocused();
    await input.pressSequentially("Phone test key", { delay: 20 });
    await expect(input).toHaveValue("Phone test key");
    await expect(input).toBeFocused();
    await input.press("Backspace");
    await input.pressSequentially("y 2", { delay: 20 });
    await expect(input).toHaveValue("Phone test key 2");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    expect(registrations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("proxy origin mismatch is explained before the authenticator creates a key", async ({
  page,
  login,
}) => {
  await login();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  // The request still reaches the real handler: simulate the HTTPS origin a
  // TLS proxy would forward to an untrusted HTTP backend, not an API error stub.
  await page.route("**/api/auth/webauthn/register/begin", async (route) => {
    const response = await route.fetch({
      headers: {
        ...(await route.request().allHeaders()),
        origin: "https://localhost:48180",
        "sec-fetch-site": "same-origin",
      },
    });
    await route.fulfill({ response });
  });
  await page.goto("/server/settings");
  await page.getByRole("button", { name: "Добавить passkey", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить passkey", exact: true });
  await dialog.getByLabel("Название passkey").fill("Must not be created");
  await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("trusted_proxies");
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(0);
  await cdp.detach();
});
