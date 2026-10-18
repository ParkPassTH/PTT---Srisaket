const state = { user: null, dashboard: null, activities: [], farmers: [], plots: [], lots: [], selectedActivity: null, drawerInvoker: null, currentView: "overview", formMode: null, backupArchive: null };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const riskMeta = {
  FLAGGED_HIGH: ["เสี่ยงสูง", "status-critical"],
  NEEDS_REVIEW: ["ต้องตรวจสอบ", "status-review"],
  PROVISIONALLY_CLEAR: ["ผลเบื้องต้นปกติ", "status-clear"],
  APPROVED: ["อนุมัติแล้ว", "status-approved"],
  REJECTED: ["ไม่รับรอง", "status-critical"]
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || "ระบบไม่สามารถทำรายการได้");
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function initials(name) {
  return name.trim().slice(0, 1) || "–";
}

function statusBadge(riskStatus) {
  const [label, className] = riskMeta[riskStatus] || [riskStatus, "status-info"];
  return `<span class="status ${className}">${escapeHtml(label)}</span>`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { toast.hidden = true; }, 3500);
}

function showLogin() {
  $("#login-view").hidden = false;
  $("#app-view").hidden = true;
}

function showApp() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#user-chip strong").textContent = state.user.displayName;
  $("#user-chip small").textContent = state.user.roles.includes("ADMIN") ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่";
  $("#current-date").textContent = `ข้อมูลล่าสุด ${new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeStyle: "short" }).format(new Date())}`;
}

async function bootstrap() {
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
    showApp();
    await loadDashboard();
  } catch {
    showLogin();
  }
}

async function loadDashboard() {
  $("#loading-state").hidden = false;
  $("#dashboard-content").hidden = true;
  try {
    state.dashboard = await api("/api/dashboard");
    state.activities = state.dashboard.activities;
    renderDashboard();
    $("#dashboard-content").hidden = false;
  } catch (error) {
    if (error.status === 401) return showLogin();
    showToast(error.message);
  } finally {
    $("#loading-state").hidden = true;
  }
}

function renderDashboard() {
  const { summary, activities } = state.dashboard;
  const usesSheets = state.dashboard.dataSource === "google-sheets";
  $("#system-status").textContent = usesSheets ? "ระบบข้อมูลจริงพร้อมใช้" : "โหมดทดสอบชั่วคราว";
  $("#system-source").textContent = usesSheets ? "เชื่อมต่อ Google Sheets" : "ข้อมูลจะหายเมื่อระบบเริ่มใหม่";
  $("#metric-pending").textContent = summary.pendingReview;
  $("#metric-risk").textContent = summary.highRisk;
  $("#metric-today").textContent = summary.recordedToday;
  $("#metric-lots").textContent = summary.lotsInStock;
  $("#nav-review-count").textContent = summary.pendingReview;

  $("#review-list").innerHTML = activities
    .filter((item) => ["NEEDS_REVIEW", "NEEDS_CONFIRMATION"].includes(item.processingStatus))
    .slice(0, 4)
    .map((item) => `
      <button class="review-item" data-activity-id="${escapeHtml(item.activityId)}">
        <span class="farmer-mark">${escapeHtml(initials(item.farmerName))}</span>
        <span class="review-copy"><strong>${escapeHtml(item.farmerName)} · ${escapeHtml(item.plotName || "ไม่ระบุแปลง")}</strong><small>${escapeHtml(item.flagReasons[0] || item.transcript || "รอตรวจข้อมูล")}</small></span>
        ${statusBadge(item.riskStatus)}
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>`).join("") || `<div class="empty-state"><strong>ไม่มีงานค้าง</strong><p>รายการใหม่จะปรากฏที่นี่</p></div>`;

  const latest = activities[0];
  $("#trace-steps").innerHTML = latest ? [
    ["รับข้อความเสียง", formatDateTime(latest.receivedAt), false],
    ["ถอดเสียงและสกัดข้อมูล", latest.transcript ? "ดำเนินการแล้ว" : "กำลังประมวลผล", !latest.transcript],
    [latest.riskStatus === "FLAGGED_HIGH" ? "ตรวจพบความเสี่ยง" : "ประเมินกฎ ICS", riskMeta[latest.riskStatus]?.[0] || latest.riskStatus, false],
    ["ผลการตรวจ", latest.processingStatus === "COMPLETED" ? "ดำเนินการแล้ว" : "รอเจ้าหน้าที่", latest.processingStatus !== "COMPLETED"]
  ].map(([title, detail, pending]) => `<div class="trace-step ${pending ? "pending" : ""}"><span class="trace-node"></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></div>`).join("") : `<div class="empty-state"><strong>ยังไม่มีเส้นทางงาน</strong><p>เมื่อรับเสียงรายการแรก ขั้นตอนประมวลผลจะแสดงที่นี่</p></div>`;

  renderActivityTable(activities);
}

async function showView(view) {
  const supported = ["overview", "reviews", "activities", "lots", "farmers", "reports", "integrations"];
  if (!supported.includes(view)) {
    showToast(view === "lots" ? "ล็อตและคลังอยู่ในเฟสถัดไป" : "รายงานและไฟล์ส่งออกอยู่ในเฟสถัดไป");
    return;
  }
  state.currentView = view;
  $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $("#dashboard-content").hidden = !["overview", "reviews", "activities"].includes(view);
  $("#farmers-content").hidden = view !== "farmers";
  $("#integrations-content").hidden = view !== "integrations";
  $("#lots-content").hidden = view !== "lots";
  $("#reports-content").hidden = view !== "reports";
  $("#sidebar").classList.remove("open");
  const titles = { overview:"งานที่ต้องดูแลวันนี้", reviews:"งานที่รอตรวจสอบ", activities:"ทะเบียนกิจกรรมแปลง", lots:"ล็อตและคลัง", farmers:"ทะเบียนเกษตรกรและแปลง", reports:"รายงาน", integrations:"สถานะการเชื่อมต่อ" };
  $("#page-title").textContent = titles[view];
  if (view === "farmers") await loadFarmers();
  if (view === "integrations") await loadIntegrations();
  if (view === "lots") await loadLots();
  if (view === "reports") renderReports();
  if (view === "reviews") document.querySelector(".review-panel")?.scrollIntoView({ behavior:"smooth", block:"start" });
  if (view === "activities") document.querySelector(".registry-panel")?.scrollIntoView({ behavior:"smooth", block:"start" });
}

async function loadLots() {
  try {
    const [{ lots }, { activities }] = await Promise.all([api("/api/lots"), api("/api/activities")]);
    state.lots = lots;
    state.activities = activities;
    renderLots();
  } catch (error) { showToast(error.message); }
}

function renderLots() {
  const statusLabel = { DRAFT:"ฉบับร่าง", IN_STOCK:"ในคลัง", RESERVED:"จองแล้ว", SHIPPED:"ส่งแล้ว", VOID:"ยกเลิก", RECALLED:"เรียกคืน" };
  $("#lot-count").textContent = `${state.lots.length} ล็อต`;
  $("#lot-list").innerHTML = state.lots.map((lot) => `<article class="lot-card"><div><span class="member-code">${escapeHtml(lot.lotId)}</span><h3>${escapeHtml(lot.crop)}</h3><p>${escapeHtml(lot.farmerName)} · ${escapeHtml(lot.plotName)} · ${escapeHtml(lot.quantity)} ${escapeHtml(lot.unit)}</p><small>เก็บเกี่ยว ${new Intl.DateTimeFormat("th-TH", { dateStyle:"medium" }).format(new Date(lot.harvestDate))}</small></div><div class="lot-actions"><span class="status ${["VOID","RECALLED"].includes(lot.inventoryStatus) ? "status-critical" : "status-clear"}">${statusLabel[lot.inventoryStatus]}</span><a class="text-button" href="/trace/${encodeURIComponent(lot.traceToken)}" target="_blank" rel="noopener">เปิดหน้าตรวจสอบ</a><a class="text-button" href="/api/lots/${encodeURIComponent(lot.lotId)}/qr.png">ดาวน์โหลด QR</a>${["VOID","RECALLED"].includes(lot.inventoryStatus) ? "" : `<select data-lot-status="${escapeHtml(lot.lotId)}" aria-label="เปลี่ยนสถานะ ${escapeHtml(lot.lotId)}"><option value="">เปลี่ยนสถานะ...</option>${lot.inventoryStatus !== "SHIPPED" ? '<option value="SHIPPED">ส่งสินค้าแล้ว</option>' : ""}<option value="RECALLED">เรียกคืน</option><option value="VOID">ยกเลิก</option></select>`}</div></article>`).join("") || `<div class="empty-state"><strong>ยังไม่มีล็อต</strong><p>ล็อตแรกสร้างได้จากรายการเก็บเกี่ยวที่อนุมัติและมีข้อมูลครบ</p></div>`;
  const harvests = state.activities.filter((x) => x.activityType?.trim().toLocaleLowerCase("th-TH").includes("เก็บเกี่ยว") && x.riskStatus === "APPROVED" && x.harvestAmount && x.harvestUnit && x.crop && x.plotName && !x.createdLotId);
  $("#harvest-list").innerHTML = harvests.map((item) => `<article class="farmer-card"><div class="farmer-main"><span class="farmer-mark">${escapeHtml(initials(item.farmerName))}</span><div><strong>${escapeHtml(item.farmerName)} · ${escapeHtml(item.crop)}</strong><small>${escapeHtml(item.plotName)} · ${escapeHtml(item.harvestAmount)} ${escapeHtml(item.harvestUnit)}</small></div><button class="button secondary-button" data-create-lot="${escapeHtml(item.activityId)}">สร้างล็อต</button></div></article>`).join("") || `<div class="empty-state"><strong>ยังไม่มีกิจกรรมที่พร้อมสร้างล็อต</strong><p>ตรวจและอนุมัติกิจกรรมเก็บเกี่ยวที่มีพืช แปลง ปริมาณ และหน่วยครบก่อน</p></div>`;
}

function renderReports() {
  const { summary } = state.dashboard;
  const farmers = new Set(state.activities.map((x) => x.farmerId)).size;
  $("#report-grid").innerHTML = `<article class="metric"><span>กิจกรรมทั้งหมด</span><strong>${state.activities.length}</strong><small>รายการที่โหลดในทะเบียน</small></article><article class="metric"><span>เกษตรกรที่มีรายการ</span><strong>${farmers}</strong><small>นับจากกิจกรรม</small></article><article class="metric"><span>รอตรวจสอบ</span><strong>${summary.pendingReview}</strong><small>ต้องดำเนินการ</small></article><article class="metric"><span>ล็อตในคลัง</span><strong>${summary.lotsInStock}</strong><small>พร้อมส่งต่อ</small></article>`;
}

async function loadFarmers() {
  try {
    const data = await api("/api/farmers");
    state.farmers = data.farmers;
    state.plots = data.plots;
    renderFarmers();
  } catch (error) { showToast(error.message); }
}

function renderFarmers() {
  const query = $("#farmer-search").value.trim().toLocaleLowerCase("th-TH");
  const farmers = state.farmers.filter((item) => !query || `${item.memberCode} ${item.displayName}`.toLocaleLowerCase("th-TH").includes(query));
  $("#farmer-count").textContent = `${state.farmers.length} สมาชิก · ${state.plots.length} แปลง`;
  $("#farmer-list").innerHTML = farmers.map((farmer) => {
    const plots = state.plots.filter((plot) => plot.farmerId === farmer.farmerId);
    return `<article class="farmer-card"><div class="farmer-main"><span class="farmer-mark">${escapeHtml(initials(farmer.displayName))}</span><div><div class="farmer-title"><strong>${escapeHtml(farmer.displayName)}</strong><span class="member-code">${escapeHtml(farmer.memberCode)}</span></div><small>${farmer.lineUserId ? "เชื่อม LINE แล้ว" : "ยังไม่เชื่อม LINE"} · ${farmer.status === "ACTIVE" ? "ใช้งาน" : "พักใช้งาน"}</small></div><button class="text-button" data-add-plot="${escapeHtml(farmer.farmerId)}">+ เพิ่มแปลง</button></div><div class="plot-list">${plots.map((plot) => `<div class="plot-row"><span><strong>${escapeHtml(plot.name)}</strong><small>${escapeHtml(plot.crop)}</small></span><span class="status ${plot.status === "ACTIVE" ? "status-clear" : "status-info"}">${plot.status === "ACTIVE" ? "ใช้งาน" : "พักใช้งาน"}</span></div>`).join("") || `<p class="muted">ยังไม่มีแปลง กด “เพิ่มแปลง” เพื่อให้ AI จับคู่กิจกรรมได้แม่นขึ้น</p>`}</div></article>`;
  }).join("") || `<div class="empty-state"><strong>ยังไม่มีสมาชิก</strong><p>เพิ่มเกษตรกรคนแรกจากปุ่มด้านบน โดยไม่ต้องเปิด Google Sheet</p></div>`;
}

async function loadIntegrations() {
  const grid = $("#integration-grid");
  grid.innerHTML = `<div class="loading-state"><span class="spinner"></span> กำลังตรวจการตั้งค่า...</div>`;
  try {
    const [status, outbox] = await Promise.all([api("/api/integrations/status"), api("/api/system/outbox")]);
    const items = [
      ["ฐานข้อมูล", status.dataStore.configured, status.dataStore.configured ? "Google Sheets" : "Memory ชั่วคราว", "ตั้ง DATA_DRIVER=google-sheets และข้อมูลบัญชีบริการ"],
      ["LINE Messaging API", status.line.configured, status.line.configured ? "Webhook พร้อมรับข้อความ" : "ยังขาด Channel secret หรือ access token", "ตั้ง LINE_CHANNEL_SECRET และ LINE_CHANNEL_ACCESS_TOKEN"],
      ["ระบบ AI", status.ai.configured, status.ai.configured ? `${status.ai.provider} · ${status.ai.model}` : `ยังไม่มีคีย์สำหรับ ${status.ai.provider}`, "ตั้ง AI_PROVIDER=gemini และ GEMINI_API_KEY"],
      ["หน้าตรวจสอบล็อต", status.publicTrace.configured, status.publicTrace.configured ? "เปิดใช้งาน" : "ปิดใช้งาน", "ตั้ง PUBLIC_TRACE_ENABLED=true"]
    ];
    grid.innerHTML = items.map(([name, ready, detail, action]) => `<article class="integration-card ${ready ? "ready" : "attention"}"><div class="integration-head"><h3>${escapeHtml(name)}</h3><span class="status ${ready ? "status-clear" : "status-review"}">${ready ? "พร้อม" : "ต้องตั้งค่า"}</span></div><strong>${escapeHtml(detail)}</strong><p>${ready ? "ระบบพบค่าที่จำเป็นแล้ว" : escapeHtml(action)}</p></article>`).join("");
    renderOutbox(outbox);
  } catch (error) { grid.innerHTML = `<div class="empty-state"><strong>ตรวจสถานะไม่ได้</strong><p>${escapeHtml(error.message)}</p></div>`; }
}

function renderOutbox({ messages, summary }) {
  $("#outbox-summary").textContent = `รอส่ง ${summary.pending} · ส่งไม่สำเร็จถาวร ${summary.deadLetter} · ส่งแล้ว ${summary.delivered}`;
  const actionable = messages.filter((item) => item.status !== "DELIVERED").slice(0,20);
  $("#outbox-list").innerHTML = actionable.map((item) => `<article class="outbox-row"><div><strong>${item.status === "DEAD_LETTER" ? "ต้องกู้ด้วยเจ้าหน้าที่" : "รอส่งอัตโนมัติ"}</strong><small>${escapeHtml(item.relatedEntityId || item.messageId)} · ลองแล้ว ${item.attempts}/${item.maxAttempts}</small><p>${escapeHtml(item.lastError || "ระบบจะส่งเมื่อถึงเวลาที่กำหนด")}</p></div><button class="button secondary-button" type="button" data-retry-outbox="${escapeHtml(item.messageId)}">ลองส่งตอนนี้</button></article>`).join("") || `<div class="empty-state"><strong>ไม่มีข้อความค้าง</strong><p>ข้อความ LINE ส่งสำเร็จแล้ว หรือยังไม่เคยมีงานแจ้งเตือน</p></div>`;
}

function openEntityDialog(mode, farmerId, extra = {}) {
  state.formMode = { mode, farmerId, ...extra };
  const isFarmer = mode === "farmer";
  const isLotStatus = mode === "lot-status";
  $("#entity-dialog-title").textContent = isFarmer ? "เพิ่มเกษตรกร" : isLotStatus ? "ยืนยันการเปลี่ยนสถานะล็อต" : "เพิ่มแปลง";
  $("#entity-form-error").hidden = true;
  $("#entity-form-fields").innerHTML = isFarmer
    ? `<label>รหัสสมาชิก<input name="memberCode" required minlength="2" maxlength="30" placeholder="เช่น M001" pattern="[A-Za-z0-9_-]+"><small>ใช้รหัสนี้สำหรับคำสั่งลงทะเบียนใน LINE</small></label><label>ชื่อเกษตรกร<input name="displayName" required minlength="2" maxlength="120" placeholder="ชื่อและนามสกุล"></label>`
    : isLotStatus ? `<p>เปลี่ยนสถานะล็อตเป็น <strong>${escapeHtml(extra.statusLabel || extra.status)}</strong></p><label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500" placeholder="ระบุเหตุผลอย่างน้อย 5 ตัวอักษร"></textarea></label>`
    : `<label>ชื่อแปลง<input name="name" required maxlength="120" placeholder="เช่น แปลงเหนือ"></label><label>พืชหลัก<input name="crop" required maxlength="120" placeholder="เช่น หอมแดง"></label>`;
  $("#entity-dialog").showModal();
  $("#entity-form-fields input").focus();
}

function renderActivityTable(activities) {
  const table = $("#activity-table");
  const empty = $("#empty-state");
  table.innerHTML = activities.map((item) => `
    <tr>
      <td><strong>${new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.receivedAt))}</strong><small>${new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(item.receivedAt))}</small></td>
      <td><strong>${escapeHtml(item.farmerName)}</strong><small>${escapeHtml(item.plotName || "ไม่ระบุแปลง")} · ${escapeHtml(item.crop || "ไม่ระบุพืช")}</small></td>
      <td>${escapeHtml(item.activityType || "รอประมวลผล")}</td>
      <td class="confidence">${Math.round(item.confidence * 100)}%</td>
      <td>${statusBadge(item.riskStatus)}</td>
      <td><button class="row-button" data-activity-id="${escapeHtml(item.activityId)}" aria-label="เปิดรายละเอียด ${escapeHtml(item.farmerName)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></td>
    </tr>`).join("");
  empty.hidden = activities.length > 0;
  if (!activities.length) {
    const hasFilter = Boolean($("#activity-search").value || $("#risk-filter").value);
    $("#empty-title").textContent = hasFilter ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ยังไม่มีกิจกรรมจริง";
    $("#empty-description").textContent = hasFilter ? "ลองล้างคำค้นหาหรือเลือกสถานะอื่น" : "เชื่อมบัญชีเกษตรกรใน LINE แล้วส่งข้อความเสียง รายการแรกจะปรากฏที่นี่";
  }
}

async function openActivity(activityId) {
  state.drawerInvoker = document.activeElement;
  const drawer = $("#review-drawer");
  $("#drawer-title").textContent = "กำลังโหลด...";
  $("#drawer-content").innerHTML = `<div class="loading-state"><span class="spinner"></span> กำลังโหลดหลักฐาน...</div>`;
  $("#drawer-backdrop").hidden = false;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#sidebar").inert = true;
  $("#main-content").inert = true;
  $(".mobile-header").inert = true;
  try {
    const [data, registry] = await Promise.all([api(`/api/activities/${encodeURIComponent(activityId)}`), api("/api/farmers")]);
    state.farmers = registry.farmers; state.plots = registry.plots;
    state.selectedActivity = data.activity;
    renderDrawer(data);
    $("#drawer-close").focus();
  } catch (error) {
    $("#drawer-content").innerHTML = `<div class="empty-state"><strong>เปิดหลักฐานไม่ได้</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderDrawer({ activity, reviews, audit }) {
  const farmerPlots = state.plots.filter((plot) => plot.farmerId === activity.farmerId && plot.status === "ACTIVE");
  const localDateTime = new Date(activity.occurredAt).toLocaleString("sv-SE", { timeZone:"Asia/Bangkok" }).slice(0,16).replace(" ", "T");
  $("#drawer-title").textContent = `${activity.farmerName} · ${activity.plotName || "ไม่ระบุแปลง"}`;
  $("#drawer-content").innerHTML = `
    <section class="evidence-block"><h3>ข้อความที่ระบบถอดได้</h3><p class="transcript">“${escapeHtml(activity.transcript || "ยังไม่มีข้อความถอดเสียง") }”</p></section>
    <section class="evidence-block"><h3>ข้อมูลที่สกัดได้</h3><dl class="evidence-grid"><dt>รหัสรายการ</dt><dd>${escapeHtml(activity.activityId)}</dd><dt>พืช</dt><dd>${escapeHtml(activity.crop || "ไม่ระบุ")}</dd><dt>กิจกรรม</dt><dd>${escapeHtml(activity.activityType || "ไม่ระบุ")}</dd><dt>สิ่งที่ใช้</dt><dd>${escapeHtml(activity.inputsUsed || "ไม่ระบุ")}</dd><dt>ความมั่นใจ</dt><dd>${Math.round(activity.confidence * 100)}%</dd><dt>สถานะ</dt><dd>${statusBadge(activity.riskStatus)}</dd></dl></section>
    <section class="evidence-block"><h3>เหตุผลที่ต้องตรวจ</h3>${activity.flagReasons.length ? `<ul class="reason-list">${activity.flagReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : `<p>ไม่พบเหตุผลแจ้งเตือนเพิ่มเติม</p>`}</section>
    <section class="evidence-block"><h3>ประวัติการดำเนินการ</h3><p>${reviews.length} ผลการตรวจ · ${audit.length} เหตุการณ์ใน audit trail</p></section>
    ${activity.processingStatus === "FAILED_RETRYABLE" ? `<section class="evidence-block retry-block"><h3>ประมวลผลไม่สำเร็จ</h3><p>${escapeHtml(activity.flagReasons[0] || "เกิดข้อผิดพลาดชั่วคราว")}</p><button id="retry-activity" class="button secondary-button" type="button">ประมวลผลไฟล์เสียงเดิมอีกครั้ง</button></section>` : ""}
    <form id="correction-form" class="review-form correction-form"><h3>แก้ไขข้อมูลที่สกัด</h3><div class="correction-grid"><label>วันและเวลาที่ทำ<input name="occurredAt" type="datetime-local" value="${escapeHtml(localDateTime)}" required></label><label>แปลง<select name="plotId" required><option value="">เลือกแปลง</option>${farmerPlots.map((plot) => `<option value="${escapeHtml(plot.plotId)}" ${plot.plotId === activity.plotId ? "selected" : ""}>${escapeHtml(plot.name)} · ${escapeHtml(plot.crop)}</option>`).join("")}</select></label><label>พืช<input name="crop" value="${escapeHtml(activity.crop || "")}" required></label><label>กิจกรรม<input name="activityType" value="${escapeHtml(activity.activityType || "")}" required></label><label class="full-field">ปัจจัยการผลิต<input name="inputsUsed" value="${escapeHtml(activity.inputsUsed || "")}"></label><label>ปริมาณเก็บเกี่ยว<input name="harvestAmount" type="number" min="0" step="any" value="${activity.harvestAmount ?? ""}"></label><label>หน่วย<input name="harvestUnit" value="${escapeHtml(activity.harvestUnit || "")}"></label><label class="full-field">เหตุผลที่แก้ไข<textarea name="reason" required minlength="5" maxlength="500" placeholder="อธิบายหลักฐานที่ใช้แก้ไข"></textarea></label></div><button class="button secondary-button" type="submit">บันทึกการแก้ไขและ Snapshot</button></form>
    <form id="review-form" class="review-form"><label for="review-reason"><strong>เหตุผลการดำเนินการ</strong></label><textarea id="review-reason" name="reason" required minlength="5" maxlength="500" placeholder="อธิบายสิ่งที่ตรวจพบหรือข้อมูลที่ต้องขอเพิ่ม"></textarea><div class="decision-row"><button type="submit" name="decision" value="REQUEST_INFO" class="decision-button">ขอข้อมูลเพิ่ม</button><button type="submit" name="decision" value="FLAG" class="decision-button flag">ยืนยันความเสี่ยง</button><button type="submit" name="decision" value="APPROVE" class="decision-button primary">อนุมัติรายการ</button></div></form>`;
}

function closeDrawer() {
  $("#review-drawer").classList.remove("open");
  $("#review-drawer").setAttribute("aria-hidden", "true");
  $("#drawer-backdrop").hidden = true;
  $("#sidebar").inert = false;
  $("#main-content").inert = false;
  $(".mobile-header").inert = false;
  if (state.drawerInvoker instanceof HTMLElement) state.drawerInvoker.focus();
}

async function filterActivities() {
  const query = $("#activity-search").value.trim();
  const risk = $("#risk-filter").value;
  try {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (risk) params.set("risk", risk);
    const { activities } = await api(`/api/activities?${params}`);
    renderActivityTable(activities);
  } catch (error) { showToast(error.message); }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("button[type=submit]", event.currentTarget);
  const errorElement = $("#login-error");
  button.disabled = true;
  errorElement.hidden = true;
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const { user } = await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
    state.user = user;
    showApp();
    await loadDashboard();
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally { button.disabled = false; }
});

$("#logout-button").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); showLogin(); });
$("#menu-button").addEventListener("click", () => { const open = $("#sidebar").classList.toggle("open"); $("#menu-button").setAttribute("aria-expanded", String(open)); });
$("#drawer-close").addEventListener("click", closeDrawer);
$("#drawer-backdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
  if (event.key === "Tab" && $("#review-drawer").classList.contains("open")) {
    const focusable = $$("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])", $("#review-drawer")).filter((element) => !element.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
document.addEventListener("click", (event) => { const trigger = event.target.closest("[data-activity-id]"); if (trigger) openActivity(trigger.dataset.activityId); });
document.addEventListener("click", (event) => {
  const viewTrigger = event.target.closest("[data-view]");
  if (viewTrigger) showView(viewTrigger.dataset.view);
  const plotTrigger = event.target.closest("[data-add-plot]");
  if (plotTrigger) openEntityDialog("plot", plotTrigger.dataset.addPlot);
  const lotTrigger = event.target.closest("[data-create-lot]");
  if (lotTrigger) createLot(lotTrigger.dataset.createLot, lotTrigger);
});
async function createLot(activityId, button) {
  button.disabled = true;
  try { await api("/api/lots", { method:"POST", body:JSON.stringify({ activityId }) }); showToast("สร้างล็อตและรหัสตรวจสอบแล้ว"); await loadLots(); }
  catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
}
$("#lot-list").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-lot-status]");
  if (!select || !select.value) return;
  openEntityDialog("lot-status", undefined, { lotId:select.dataset.lotStatus, status:select.value, statusLabel:select.selectedOptions[0].textContent });
  select.value = "";
});
$("#add-farmer-button").addEventListener("click", () => openEntityDialog("farmer"));
$("#farmer-search").addEventListener("input", renderFarmers);
$("#refresh-integrations").addEventListener("click", loadIntegrations);
$("#process-outbox").addEventListener("click", async (event) => { event.currentTarget.disabled=true; try { const result=await api("/api/system/outbox/process", { method:"POST" }); showToast(`ประมวลผล ${result.processed} ข้อความ`); await loadIntegrations(); } catch(error) { showToast(error.message); } finally { event.currentTarget.disabled=false; } });
$("#outbox-list").addEventListener("click", async (event) => { const button=event.target.closest("[data-retry-outbox]"); if (!button) return; button.disabled=true; try { const { message }=await api(`/api/system/outbox/${encodeURIComponent(button.dataset.retryOutbox)}/retry`, { method:"POST" }); showToast(message.status === "DELIVERED" ? "ส่งข้อความสำเร็จ" : "ยังส่งไม่ได้ ระบบเก็บไว้ลองใหม่แล้ว"); await loadIntegrations(); } catch(error) { showToast(error.message); button.disabled=false; } });
$("#entity-dialog-close").addEventListener("click", () => $("#entity-dialog").close());
$("#entity-cancel").addEventListener("click", () => $("#entity-dialog").close());
$("#entity-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorElement = $("#entity-form-error");
  const submitButton = $("button[type=submit]", event.currentTarget);
  errorElement.hidden = true;
  submitButton.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const isFarmer = state.formMode.mode === "farmer";
    const isLotStatus = state.formMode.mode === "lot-status";
    const body = isFarmer ? values : isLotStatus ? { reason:values.reason, status:state.formMode.status } : { ...values, farmerId: state.formMode.farmerId };
    await api(isFarmer ? "/api/farmers" : isLotStatus ? `/api/lots/${encodeURIComponent(state.formMode.lotId)}/status` : "/api/plots", { method:isLotStatus ? "PATCH" : "POST", body:JSON.stringify(body) });
    $("#entity-dialog").close();
    showToast(isFarmer ? "เพิ่มเกษตรกรแล้ว" : isLotStatus ? "อัปเดตสถานะล็อตแล้ว" : "เพิ่มแปลงแล้ว");
    if (isLotStatus) await loadLots(); else await loadFarmers();
  } catch (error) { errorElement.textContent = error.message; errorElement.hidden = false; }
  finally { submitButton.disabled = false; }
});
$("#activity-search").addEventListener("input", () => { clearTimeout(filterActivities.timer); filterActivities.timer = setTimeout(filterActivities, 250); });
$("#risk-filter").addEventListener("change", filterActivities);
$("#backup-file").addEventListener("change", async (event) => {
  state.backupArchive=null; $("#restore-backup").disabled=true;
  const file=event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 5*1024*1024) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
    const archive=JSON.parse(await file.text());
    const result=await api("/api/system/backup/validate", { method:"POST", body:JSON.stringify(archive) });
    state.backupArchive=archive;
    $("#backup-validation").textContent=`ไฟล์ถูกต้อง · วันที่ ${formatDateTime(result.generatedAt)} · เกษตรกร ${result.counts.farmers} · กิจกรรม ${result.counts.activities} · ล็อต ${result.counts.lots}`;
    $("#restore-backup").disabled=false;
  } catch(error) { $("#backup-validation").textContent=`ใช้ไฟล์นี้ไม่ได้: ${error.message}`; }
});
$("#restore-backup").addEventListener("click", async (event) => {
  const reason=$("#backup-reason").value.trim();
  if (!state.backupArchive || reason.length<5) { showToast("กรุณาเลือกไฟล์ที่ผ่านการตรวจและระบุเหตุผลอย่างน้อย 5 ตัวอักษร"); return; }
  event.currentTarget.disabled=true;
  try { const result=await api("/api/system/backup/restore", { method:"POST", body:JSON.stringify({ confirm:"MERGE_BACKUP", reason, archive:state.backupArchive }) }); showToast(`กู้คืนแบบรวมข้อมูลสำเร็จ ${result.restored.counts.activities} กิจกรรม`); state.backupArchive=null; $("#backup-file").value=""; $("#backup-reason").value=""; $("#backup-validation").textContent="กู้คืนเสร็จและบันทึก Audit แล้ว"; }
  catch(error) { showToast(error.message); event.currentTarget.disabled=false; }
});
$("#review-drawer").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "correction-form") {
    const body = Object.fromEntries(new FormData(event.target));
    body.occurredAt = new Date(body.occurredAt).toISOString();
    if (!body.harvestAmount) delete body.harvestAmount;
    if (!body.harvestUnit) delete body.harvestUnit;
    try { await api(`/api/activities/${encodeURIComponent(state.selectedActivity.activityId)}`, { method:"PATCH", body:JSON.stringify(body) }); showToast("บันทึกการแก้ไขและ Snapshot แล้ว"); closeDrawer(); await loadDashboard(); }
    catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.id !== "review-form") return;
  const submitter = event.submitter;
  const reason = new FormData(event.target).get("reason");
  try {
    await api(`/api/activities/${encodeURIComponent(state.selectedActivity.activityId)}/review`, { method: "POST", body: JSON.stringify({ decision: submitter.value, reason }) });
    showToast("บันทึกผลการตรวจสอบแล้ว");
    closeDrawer();
    await loadDashboard();
  } catch (error) { showToast(error.message); }
});
$("#review-drawer").addEventListener("click", async (event) => {
  if (event.target.id !== "retry-activity") return;
  event.target.disabled = true;
  try { await api(`/api/activities/${encodeURIComponent(state.selectedActivity.activityId)}/retry`, { method:"POST" }); showToast("ประมวลผลไฟล์เสียงเดิมสำเร็จ"); closeDrawer(); await loadDashboard(); }
  catch (error) { showToast(error.message); event.target.disabled = false; }
});

async function showPublicTrace() {
  const token = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");
  document.body.innerHTML = `<main class="public-trace"><section class="trace-sheet"><div class="seal" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M32 7c-10 8-17 16-17 28 0 10 7 18 17 22 10-4 17-12 17-22C49 23 42 15 32 7Z"/><path d="M32 18v28M32 27c-6 0-10-3-13-7M32 36c7 0 11-3 14-8"/></svg></div><p class="eyebrow">ตรวจสอบย้อนกลับ</p><h1>ข้อมูลล็อตสินค้า</h1><div id="public-trace-result" class="loading-state"><span class="spinner"></span> กำลังตรวจรหัส...</div></section></main>`;
  try {
    const { lot, notice } = await api(`/api/trace/${encodeURIComponent(token)}`);
    const labels = { IN_STOCK:"อยู่ในคลัง", RESERVED:"จองแล้ว", SHIPPED:"ส่งออกแล้ว", VOID:"ยกเลิก", RECALLED:"เรียกคืน", DRAFT:"ฉบับร่าง" };
    $("#public-trace-result").className = "";
    $("#public-trace-result").innerHTML = `<span class="status ${["VOID","RECALLED"].includes(lot.inventoryStatus) ? "status-critical" : "status-clear"}">${escapeHtml(labels[lot.inventoryStatus] || lot.inventoryStatus)}</span><dl class="trace-facts"><dt>รหัสล็อต</dt><dd>${escapeHtml(lot.lotId)}</dd><dt>ผลผลิต</dt><dd>${escapeHtml(lot.crop)}</dd><dt>ปริมาณ</dt><dd>${escapeHtml(lot.quantity)} ${escapeHtml(lot.unit)}</dd><dt>วันที่เก็บเกี่ยว</dt><dd>${new Intl.DateTimeFormat("th-TH", { dateStyle:"long" }).format(new Date(lot.harvestDate))}</dd><dt>ชุมชน</dt><dd>${escapeHtml(lot.community)}</dd></dl><p class="trace-notice">${escapeHtml(notice)}</p>`;
  } catch (error) {
    $("#public-trace-result").className = "empty-state";
    $("#public-trace-result").innerHTML = `<strong>ตรวจสอบรหัสไม่ได้</strong><p>${escapeHtml(error.message)}</p>`;
  }
}

if (location.pathname.startsWith("/trace/")) showPublicTrace(); else bootstrap();
