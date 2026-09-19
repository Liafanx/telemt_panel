import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "./fixtures";
import { ADMIN_PASSWORD, ADMIN_USERNAME, BASE_URL, MOCK_URL } from "./env";
import { killAndWait, PANEL_BINARY } from "./stack";

test("invalid session cookie renders login after reload without clearing browser data", async ({
  page,
  context,
  login,
}) => {
  await login();
  const cookie = (await context.cookies(BASE_URL)).find((value) => value.name === "panel_session");
  expect(cookie).toBeDefined();
  const invalid = "expired-test-session-token";
  await context.addCookies([{ ...cookie!, value: invalid }]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const rejected = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/me" && response.status() === 401,
  );
  await page.reload();
  expect(await (await rejected).request().headerValue("cookie")).toContain(
    `panel_session=${invalid}`,
  );
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
  await login();
  await expect(page.getByTestId("user-card-alice")).toBeVisible();
  expect(errors).toEqual([]);
});

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

for (const basePath of ["", "/panel"]) {
  test(`password rotation revokes persistent sessions and reload recovers (${basePath || "/"})`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60000);
    const port = await availablePort();
    const scratch = await mkdtemp(path.join(tmpdir(), "panel-session-recovery-"));
    const configFile = path.join(scratch, "panel.toml");
    const base = `http://localhost:${port}${basePath}`;
    const newPassword = "rotated-e2e-password-2026";
    const hash = (value: string) =>
      execFileSync(PANEL_BINARY, ["hash-password"], {
        input: value + "\n",
        encoding: "utf8",
        timeout: 10000,
      }).trim();
    let child: ChildProcess | undefined;
    let logs = "";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    async function stop() {
      if (child?.pid) await killAndWait(child);
      child = undefined;
    }
    async function start(passwordHash: string) {
      await writeFile(
        configFile,
        [
          `listen = "127.0.0.1:${port}"`,
          `base_path = "${basePath}"`,
          `data_dir = "${path.join(scratch, "state")}"`,
          "[auth]",
          `username = "${ADMIN_USERNAME}"`,
          `password_hash = "${passwordHash}"`,
          "[telemt]",
          `url = "${MOCK_URL}"`,
          "[store]",
          'driver = "memory"',
          "[host]",
          'service_manager = "none"',
          'log_source = "file"',
          `log_file = "${path.join(scratch, "telemt.log")}"`,
          "[privileges]",
          'mode = "manual"',
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
      child = spawn(PANEL_BINARY, ["--config", configFile], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr?.on("data", (chunk) => {
        logs = (logs + chunk.toString()).slice(-32000);
      });
      await new Promise<void>((resolve, reject) => {
        child!.once("spawn", resolve);
        child!.once("error", reject);
      });
      await expect
        .poll(
          async () => {
            if (child!.exitCode !== null || child!.signalCode !== null)
              throw new Error(`test panel exited: ${logs}`);
            try {
              return (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }))
                .status;
            } catch {
              return 0;
            }
          },
          { timeout: 10000 },
        )
        .toBe(200);
    }
    async function signIn(password: string) {
      await page.getByLabel("Имя пользователя").fill(ADMIN_USERNAME);
      await page.getByLabel("Пароль").fill(password);
      await page.getByRole("button", { name: "Войти", exact: true }).click();
    }
    const session = async () =>
      (await context.cookies(`${base}/`)).find((cookie) => cookie.name === "panel_session");

    try {
      const originalHash = hash(ADMIN_PASSWORD);
      await start(originalHash);
      await page.goto(`${base}/login`);
      await signIn(ADMIN_PASSWORD);
      await expect(page).toHaveURL(`${base}/people`);
      const originalSession = await session();
      expect(originalSession).toBeDefined();
      expect(originalSession!.path).toBe(`${basePath}/`);

      // Control: the same bcrypt hash and state directory must survive restart.
      await stop();
      await start(originalHash);
      expect((await page.request.get(`${base}/api/auth/me`)).status()).toBe(200);
      expect((await session())?.value).toBe(originalSession!.value);
      await page.reload();
      await expect(page.getByTestId("user-card-alice")).toBeVisible();

      await stop();
      await start(hash(newPassword));
      expect((await session())?.value).toBe(originalSession!.value);
      const rejected = page.waitForResponse((response) => response.url() === `${base}/api/auth/me`);
      await page.reload();
      const rejectedResponse = await rejected;
      expect(rejectedResponse.status()).toBe(401);
      expect(await rejectedResponse.request().headerValue("cookie")).toContain(
        `panel_session=${originalSession!.value}`,
      );
      await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
      const oldLogin = page.waitForResponse(
        (response) =>
          response.url() === `${base}/api/auth/login` && response.request().method() === "POST",
      );
      await signIn(ADMIN_PASSWORD);
      expect((await oldLogin).status()).toBe(401);
      await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
      await signIn(newPassword);
      await expect(page).toHaveURL(`${base}/people`);
      await expect(page.getByTestId("user-card-alice")).toBeVisible();
      expect((await page.request.get(`${base}/api/auth/me`)).status()).toBe(200);
      expect((await session())?.value).not.toBe(originalSession!.value);
      expect(errors).toEqual([]);
    } finally {
      await stop();
      if (testInfo.status !== testInfo.expectedStatus)
        await testInfo.attach("isolated-panel.log", { body: logs, contentType: "text/plain" });
      await rm(scratch, { recursive: true, force: true });
    }
  });
}
