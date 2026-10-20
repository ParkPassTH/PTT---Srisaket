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

async function mockStockLedger(page) {
  const recorded = [];
  const lot = { lotId:"LOT-DEMO-001", activityId:"ACT-DEMO", farmerId:"F-001", farmerName:"สมชาย ใจดี", plotName:"แปลงหอมแดงเหนือ", crop:"หอมแดง", quantity:1200, unit:"กก.", harvestDate:"2026-10-18", inventoryStatus:"IN_STOCK", traceToken:"demo", storageLocationName:"คลังกลาง", createdAt:"2026-10-18T02:00:00.000Z", updatedAt:"2026-10-19T04:30:00.000Z" };
  await page.route("**/api/lots", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ lots:[lot] }) }));
  await page.route("**/api/standard-definitions", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ definitions:[{definitionId:"STD-HOLD",code:"ON_HOLD",name:"พักการจัดสรร",description:"รอตรวจหลักฐานเพิ่มเติม",active:true}] }) }));
  await page.route("**/api/lots/LOT-DEMO-001/standard", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ definitions:[],history:[],availabilityEligible:null }) }));
  await page.route("**/api/allocations", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ allocations:[{allocationId:"ALC-001",lotId:lot.lotId,quantity:100,unit:lot.unit,responsibleName:"เจ้าหน้าที่คลัง",recipientName:"สหกรณ์ตัวอย่าง",orderReference:"PO-100",expiresAt:"2026-10-25T10:00:00.000Z",status:"ACTIVE"}] }) }));
  await page.route("**/api/lots/LOT-DEMO-001/stock", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ balance:{lotId:lot.lotId,unit:lot.unit,onHand:1050,reserved:300,available:750,recalled:false,updatedAt:"2026-10-19T04:30:00.000Z"}, movements:[{movementId:"MOV-1",lotId:lot.lotId,movementType:"RECEIVE",quantity:1200,unit:lot.unit,actorId:"เจ้าหน้าที่คลัง",reason:"รับผลผลิตจากกิจกรรมเก็บเกี่ยว",reference:"demo-1",occurredAt:"2026-10-18T02:00:00.000Z"},{movementId:"MOV-2",lotId:lot.lotId,movementType:"RESERVE",quantity:300,unit:lot.unit,actorId:"เจ้าหน้าที่คลัง",reason:"จองสำหรับคำสั่งซื้อ PO-104",reference:"demo-2",occurredAt:"2026-10-19T03:00:00.000Z"},{movementId:"MOV-3",lotId:lot.lotId,movementType:"SHIP",quantity:150,unit:lot.unit,actorId:"เจ้าหน้าที่คลัง",reason:"จ่ายสินค้าตามใบส่งของ DN-008",reference:"demo-3",occurredAt:"2026-10-19T04:30:00.000Z"}] }) }));
  await page.route("**/api/lots/LOT-DEMO-001/stock-movements", async (route) => {
    recorded.push(route.request().postDataJSON());
    await route.fulfill({ status:201, contentType:"application/json", body:JSON.stringify({ created:true, movement:{movementId:"MOV-4"}, balance:{lotId:lot.lotId,unit:lot.unit,onHand:1050,reserved:325,available:725,recalled:false} }) });
  });
  return recorded;
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
  const recordedStockActions = await mockStockLedger(desktop);
  await desktop.locator('[data-view="lots"]').click();
  await desktop.locator("#lots-content").waitFor({ state:"visible" });
  await desktop.getByRole("button", { name:"จองสินค้า" }).waitFor();
  await capture(desktop, "lots-desktop");
  await desktop.getByRole("button", { name:"จองสินค้า" }).click();
  await desktop.getByLabel("ปริมาณ (กก.)").fill("25");
  await desktop.locator("#entity-dialog").getByRole("textbox", { name:"เหตุผล" }).fill("จองสำหรับคำสั่งซื้อทดสอบ PO-105");
  await capture(desktop, "stock-operation-dialog-desktop");
  await desktop.locator("#entity-form button[type=submit]").evaluate((button) => { button.click(); button.click(); });
  await desktop.locator("#entity-dialog").waitFor({ state:"hidden" });
  if (recordedStockActions.length !== 1 || recordedStockActions[0].type !== "RESERVE" || recordedStockActions[0].quantity !== 25) throw new Error(`Stock action guard failed: ${JSON.stringify(recordedStockActions)}`);
  await desktop.locator('[data-view="reports"]').click();
  await desktop.locator("#reports-content").waitFor({ state:"visible" });
  await desktop.waitForFunction(() => !document.querySelector("#impact-content")?.textContent?.includes("กำลัง"));
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
  await mockStockLedger(mobile);
  await mobile.locator("#menu-button").click();
  await mobile.locator('[data-view="lots"]').click();
  await mobile.locator("#lots-content").waitFor({ state:"visible" });
  await mobile.waitForFunction(() => !document.querySelector("#lot-count")?.textContent?.includes("กำลังโหลด"));
  await mobile.waitForTimeout(300);
  const lotOverflow = await mobile.evaluate(() => ({ viewport:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth }));
  if (lotOverflow.scrollWidth > lotOverflow.viewport + 1) throw new Error(`Lots mobile overflow: ${JSON.stringify(lotOverflow)}`);
  await capture(mobile, "lots-mobile");
  await mobile.locator("#menu-button").click();
  await mobile.locator('[data-view="reports"]').click();
  await mobile.locator("#reports-content").waitFor({ state:"visible" });
  await mobile.waitForFunction(() => !document.querySelector("#impact-content")?.textContent?.includes("กำลัง"));
  await mobile.waitForTimeout(300);
  await capture(mobile, "reports-mobile");

  await browser.close();
  console.log(JSON.stringify({ ok: true, captures: ["login-desktop.png", "desktop.png", "farmers-desktop.png", "integrations-desktop.png", "lots-desktop.png", "stock-operation-dialog-desktop.png", "reports-desktop.png", "imports-desktop.png", "login-mobile.png", "mobile.png", "farmers-mobile.png", "imports-mobile.png", "lots-mobile.png", "reports-mobile.png"] }));
} finally {
  server.kill();
}
