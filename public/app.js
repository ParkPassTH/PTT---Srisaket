const state = { user: null, dashboard: null, activities: [], selectedActivity: null, drawerInvoker: null };

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
    const data = await api(`/api/activities/${encodeURIComponent(activityId)}`);
    state.selectedActivity = data.activity;
    renderDrawer(data);
    $("#drawer-close").focus();
  } catch (error) {
    $("#drawer-content").innerHTML = `<div class="empty-state"><strong>เปิดหลักฐานไม่ได้</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderDrawer({ activity, reviews, audit }) {
  $("#drawer-title").textContent = `${activity.farmerName} · ${activity.plotName || "ไม่ระบุแปลง"}`;
  $("#drawer-content").innerHTML = `
    <section class="evidence-block"><h3>ข้อความที่ระบบถอดได้</h3><p class="transcript">“${escapeHtml(activity.transcript || "ยังไม่มีข้อความถอดเสียง") }”</p></section>
    <section class="evidence-block"><h3>ข้อมูลที่สกัดได้</h3><dl class="evidence-grid"><dt>รหัสรายการ</dt><dd>${escapeHtml(activity.activityId)}</dd><dt>พืช</dt><dd>${escapeHtml(activity.crop || "ไม่ระบุ")}</dd><dt>กิจกรรม</dt><dd>${escapeHtml(activity.activityType || "ไม่ระบุ")}</dd><dt>สิ่งที่ใช้</dt><dd>${escapeHtml(activity.inputsUsed || "ไม่ระบุ")}</dd><dt>ความมั่นใจ</dt><dd>${Math.round(activity.confidence * 100)}%</dd><dt>สถานะ</dt><dd>${statusBadge(activity.riskStatus)}</dd></dl></section>
    <section class="evidence-block"><h3>เหตุผลที่ต้องตรวจ</h3>${activity.flagReasons.length ? `<ul class="reason-list">${activity.flagReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : `<p>ไม่พบเหตุผลแจ้งเตือนเพิ่มเติม</p>`}</section>
    <section class="evidence-block"><h3>ประวัติการดำเนินการ</h3><p>${reviews.length} ผลการตรวจ · ${audit.length} เหตุการณ์ใน audit trail</p></section>
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
  if (!viewTrigger || viewTrigger.dataset.view === "overview") return;
  showToast("ส่วนนี้กำลังพัฒนา โดย Dashboard ภาพรวมและงานตรวจสอบพร้อมทดสอบแล้ว");
});
$("#activity-search").addEventListener("input", () => { clearTimeout(filterActivities.timer); filterActivities.timer = setTimeout(filterActivities, 250); });
$("#risk-filter").addEventListener("change", filterActivities);
$("#review-drawer").addEventListener("submit", async (event) => {
  if (event.target.id !== "review-form") return;
  event.preventDefault();
  const submitter = event.submitter;
  const reason = new FormData(event.target).get("reason");
  try {
    await api(`/api/activities/${encodeURIComponent(state.selectedActivity.activityId)}/review`, { method: "POST", body: JSON.stringify({ decision: submitter.value, reason }) });
    showToast("บันทึกผลการตรวจสอบแล้ว");
    closeDrawer();
    await loadDashboard();
  } catch (error) { showToast(error.message); }
});

bootstrap();
