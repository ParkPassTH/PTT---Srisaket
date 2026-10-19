import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const port = 3217;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["dist/src/server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    APP_BASE_URL: baseUrl,
    DATA_DRIVER: "memory",
    SESSION_SECRET: "visual-check-session-secret-at-least-32-characters",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "change-this-before-deploy",
    PUBLIC_TRACE_ENABLED: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Visual check server did not start");
}

async function capture(page, name) {
  await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true });
}

try {
  await mkdir(".impeccable/review", { recursive: true });
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true
  });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await capture(desktop, "login-desktop");
  await desktop.getByLabel("อีเมล").fill("admin@example.com");
  await desktop.getByLabel("รหัสผ่าน").fill("change-this-before-deploy");
  await desktop.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await desktop.locator("#dashboard-content").waitFor({ state: "visible" });
  await desktop.locator("#loading-state").waitFor({ state: "hidden" });
  await capture(desktop, "desktop");
  await desktop.locator('[data-view="farmers"]').click();
  await desktop.locator("#farmers-content").waitFor({ state:"visible" });
  await capture(desktop, "farmers-desktop");
  await desktop.locator('[data-view="integrations"]').click();
  await desktop.locator("#integrations-content").waitFor({ state:"visible" });
  await capture(desktop, "integrations-desktop");
  await desktop.locator('[data-view="lots"]').click();
  await desktop.locator("#lots-content").waitFor({ state:"visible" });
  await capture(desktop, "lots-desktop");
  await desktop.locator('[data-view="reports"]').click();
  await desktop.locator("#reports-content").waitFor({ state:"visible" });
  await capture(desktop, "reports-desktop");
  await desktop.locator('[data-view="imports"]').click();
  await desktop.locator("#imports-content").waitFor({ state:"visible" });
  await capture(desktop, "imports-desktop");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await capture(mobile, "login-mobile");
  await mobile.getByLabel("อีเมล").fill("admin@example.com");
  await mobile.getByLabel("รหัสผ่าน").fill("change-this-before-deploy");
  await mobile.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await mobile.locator("#dashboard-content").waitFor({ state: "visible" });
  await mobile.locator("#loading-state").waitFor({ state: "hidden" });
  const overflow = await mobile.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .map((element) => ({ tag: element.tagName, id: element.id, className: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width }))
      .filter((item) => item.right > document.documentElement.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 8)
  }));
  console.log(JSON.stringify({ overflow }));
  await capture(mobile, "mobile");
  await mobile.locator("#menu-button").click();
  await mobile.locator('[data-view="farmers"]').click();
  await mobile.locator("#farmers-content").waitFor({ state:"visible" });
  await capture(mobile, "farmers-mobile");
  await mobile.locator("#menu-button").click();
  await mobile.locator('[data-view="imports"]').click();
  await mobile.locator("#imports-content").waitFor({ state:"visible" });
  await mobile.waitForTimeout(300);
  await capture(mobile, "imports-mobile");

  await browser.close();
  console.log(JSON.stringify({ ok: true, captures: ["login-desktop.png", "desktop.png", "farmers-desktop.png", "integrations-desktop.png", "lots-desktop.png", "reports-desktop.png", "imports-desktop.png", "login-mobile.png", "mobile.png", "farmers-mobile.png", "imports-mobile.png"] }));
} finally {
  server.kill();
}
