const state = { user: null, dashboard: null, activities: [], farmers: [], plots: [], lots: [], lotStock: {}, lotStandards:{}, standardDefinitions:[], allocations:[], storageLocations: [], selectedActivity: null, drawerInvoker: null, currentView: "overview", formMode: null, backupArchive: null, importFile: null, importParsed: null, importPreview: null, importTemplates:[], importReviewBatches:[] };
const importFieldConfig={FARMER:[['memberCode','รหัสสมาชิก',true],['displayName','ชื่อเกษตรกร',true],['lineUserId','LINE user ID'],['status','สถานะ'],['address','ที่อยู่'],['phone','โทรศัพท์'],['registeredAt','วันที่ลงทะเบียน'],['totalAreaRai','พื้นที่รวม (ไร่)']],PLOT:[['plotId','รหัสแปลง'],['farmerId','รหัสเกษตรกร'],['memberCode','รหัสสมาชิก'],['name','ชื่อแปลง',true],['crop','พืช',true],['status','สถานะ'],['areaRai','พื้นที่ (ไร่)'],['gpsLat','ละติจูด'],['gpsLng','ลองจิจูด']]};

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
  const date=new Date(value);
  if(!value||Number.isNaN(date.getTime())) return "ไม่ระบุเวลา";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date);
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
  const supported = ["overview", "reviews", "activities", "lots", "farmers", "imports", "reports", "integrations"];
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
  $("#imports-content").hidden = view !== "imports";
  $("#sidebar").classList.remove("open");
  const titles = { overview:"งานที่ต้องดูแลวันนี้", reviews:"งานที่รอตรวจสอบ", activities:"ทะเบียนกิจกรรมแปลง", lots:"ล็อตและคลัง", farmers:"ทะเบียนเกษตรกรและแปลง", imports:"นำเข้าข้อมูลเดิม", reports:"รายงาน", integrations:"สถานะการเชื่อมต่อ" };
  $("#page-title").textContent = titles[view];
  if (view === "farmers") await loadFarmers();
  if (view === "integrations") await loadIntegrations();
  if (view === "lots") await loadLots();
  if (view === "reports") await loadImpactReport();
  if (view === "imports") await loadImportWorkspace();
  if (view === "reviews") document.querySelector(".review-panel")?.scrollIntoView({ behavior:"smooth", block:"start" });
  if (view === "activities") document.querySelector(".registry-panel")?.scrollIntoView({ behavior:"smooth", block:"start" });
}

async function loadLots() {
  $("#lot-count").textContent = "กำลังโหลดล็อตและยอดคงเหลือ...";
  $("#lot-list").innerHTML = `<div class="loading-state stock-loading" role="status"><span class="spinner"></span> กำลังตรวจยอดสินค้าและประวัติการเคลื่อนไหว...</div>`;
  try {
    const [{ lots }, { activities }, { locations }, {definitions},{allocations}] = await Promise.all([api("/api/lots"), api("/api/activities"), api("/api/storage-locations"),api("/api/standard-definitions"),api("/api/allocations")]);
    state.lots = lots;
    state.activities = activities;
    state.storageLocations = locations;
    state.standardDefinitions=definitions;
    state.allocations=allocations;
    state.lotStock = Object.fromEntries(await Promise.all(lots.map(async (lot) => {
      try { return [lot.lotId, { status:"ready", ...(await api(`/api/lots/${encodeURIComponent(lot.lotId)}/stock`)) }]; }
      catch (error) { return [lot.lotId, { status:"error", error:error.message }]; }
    })));
    state.lotStandards=Object.fromEntries(await Promise.all(lots.map(async(lot)=>{try{return[lot.lotId,await api(`/api/lots/${encodeURIComponent(lot.lotId)}/standard`)];}catch(error){return[lot.lotId,{error:error.message,history:[],current:null,availabilityEligible:null}];}})));
    renderLots();
  } catch (error) {
    $("#lot-count").textContent = "โหลดข้อมูลไม่สำเร็จ";
    $("#lot-list").innerHTML = `<div class="empty-state"><strong>เปิดทะเบียนล็อตไม่ได้</strong><p>${escapeHtml(error.message)}</p><button type="button" class="button secondary-button" data-retry-lots>ลองโหลดอีกครั้ง</button></div>`;
  }
}

const stockMovementMeta = {
  RECEIVE:["รับเข้า", "+"], RESERVE:["จองสินค้า", "−"], RELEASE:["ปลดจอง", "+"], SHIP:["จ่ายออก", "−"], ADJUST:["ปรับยอด", ""], RECALL:["เรียกคืน", ""]
};

function formatQuantity(value, unit) {
  return `${new Intl.NumberFormat("th-TH", { maximumFractionDigits:6 }).format(value)} ${unit}`;
}

function renderStockPanel(lot) {
  const stock = state.lotStock[lot.lotId];
  if (!stock || stock.status === "loading") return `<section class="stock-panel" aria-label="ยอดสินค้า ${escapeHtml(lot.lotId)}"><div class="loading-state"><span class="spinner"></span> กำลังโหลดยอดสินค้า...</div></section>`;
  if (stock.status === "error") return `<section class="stock-panel stock-error" aria-label="ยอดสินค้า ${escapeHtml(lot.lotId)}"><strong>อ่านยอดสินค้าไม่ได้</strong><p>${escapeHtml(stock.error)}</p><button type="button" class="text-button" data-retry-stock="${escapeHtml(lot.lotId)}">ลองใหม่</button></section>`;
  const { balance, movements } = stock;
  const actions = ["RESERVE","RELEASE","SHIP","ADJUST","RECALL"];
  return `<section class="stock-panel" aria-label="ยอดสินค้า ${escapeHtml(lot.lotId)}">
    <div class="stock-balance">
      <div><span>คงเหลือจริง</span><strong>${escapeHtml(formatQuantity(balance.onHand, balance.unit))}</strong></div>
      <div><span>ยอดจอง</span><strong>${escapeHtml(formatQuantity(balance.reserved, balance.unit))}</strong></div>
      <div><span>พร้อมใช้</span><strong>${escapeHtml(formatQuantity(balance.available, balance.unit))}</strong></div>
      <small>${balance.updatedAt ? `อัปเดต ${escapeHtml(formatDateTime(balance.updatedAt))}` : "ยังไม่มีรายการเคลื่อนไหว"}</small>
    </div>
    <div class="stock-actions" aria-label="บันทึกการเคลื่อนไหวสินค้า">
      ${actions.map((type) => `<button type="button" class="button ${type === "RECALL" ? "stock-critical-action" : "secondary-button"}" data-stock-action="${type}" data-lot-id="${escapeHtml(lot.lotId)}" ${((balance.recalled && type !== "RELEASE") || (type === "RESERVE" && balance.available <= 0) || (type === "RELEASE" && balance.reserved <= 0) || (type === "SHIP" && balance.onHand <= 0)) ? "disabled" : ""}>${stockMovementMeta[type][0]}</button>`).join("")}
    </div>
    ${balance.recalled ? `<p class="stock-notice" role="status">ล็อตนี้ถูกเรียกคืนแล้ว ยอดพร้อมใช้จึงเป็นศูนย์ อนุญาตเฉพาะการปลดจองที่ยังค้าง</p>` : ""}
    <details class="stock-history"><summary>ประวัติการเคลื่อนไหว <span>${movements.length} รายการ</span></summary>
      <div class="stock-history-list">${[...movements].reverse().map((item) => `<article><div><strong>${escapeHtml(stockMovementMeta[item.movementType]?.[0] || item.movementType)}</strong><small>${escapeHtml(formatDateTime(item.occurredAt))} · ${escapeHtml(item.actorId)}</small></div><div class="stock-movement-quantity"><strong>${escapeHtml(`${stockMovementMeta[item.movementType]?.[1] || ""}${formatQuantity(item.quantity, item.unit)}`)}</strong><small>${escapeHtml(item.reason)}</small></div></article>`).join("") || `<div class="empty-state compact"><strong>ยังไม่มีประวัติ</strong><p>รายการรับเข้าจะปรากฏหลังสร้างล็อตสำเร็จ</p></div>`}</div>
    </details>
  </section>`;
}

function renderLotStandard(lot) {
  const standard=state.lotStandards[lot.lotId];
  if(standard?.error) return `<section class="lot-standard-row status-critical"><strong>อ่านผลมาตรฐานไม่ได้</strong><span>${escapeHtml(standard.error)}</span></section>`;
  if(!state.standardDefinitions.length) return `<section class="lot-standard-row"><strong>มาตรฐานล็อต</strong><span class="status status-review">รอ ICS กำหนด</span><small>ยังไม่มีนิยาม T1/T2 หรือผลตรวจที่ผู้ดูแลอนุมัติ</small></section>`;
  if(!standard?.current) return `<section class="lot-standard-row"><strong>มาตรฐานล็อต</strong><span class="status status-review">รอการตรวจ</span><small>มีนิยามแล้ว แต่ยังไม่มีเจ้าหน้าที่ยืนยันผลล็อตนี้</small><button class="text-button" data-set-standard="${escapeHtml(lot.lotId)}">บันทึกผล</button></section>`;
  const blocked=["ON_HOLD","REJECTED"].includes(standard.current.status);
  return `<section class="lot-standard-row"><strong>มาตรฐานล็อต</strong><span class="status ${blocked?"status-critical":"status-approved"}">${escapeHtml(standard.current.status)}</span><small>${blocked?"กันออกจากยอดพร้อมจัดสรร":"ใช้จัดสรรได้ตามยอดคงเหลือ"} · มีประวัติ ${standard.history.length} รายการ</small><button class="text-button" data-set-standard="${escapeHtml(lot.lotId)}">บันทึกผลใหม่</button></section>`;
}

function renderAllocations(lot){
  const items=state.allocations.filter((x)=>x.lotId===lot.lotId);
  return `<section class="allocation-panel"><header><div><strong>การจัดสรรสินค้า</strong><small>${items.length?`${items.length} รายการพร้อมผู้รับผิดชอบและผู้รับสินค้า`:"ยังไม่มีการจัดสรรจากล็อตนี้"}</small></div><button type="button" class="button secondary-button" data-create-allocation="${escapeHtml(lot.lotId)}">สร้างการจัดสรร</button></header>${items.length?`<div class="allocation-list">${items.map((x)=>`<article><div><strong>${escapeHtml(x.recipientName)}</strong><small>ผู้รับผิดชอบ ${escapeHtml(x.responsibleName)} · อ้างอิง ${escapeHtml(x.orderReference)}</small><small>หมดอายุ ${escapeHtml(formatDateTime(x.expiresAt))}</small></div><div><span class="status ${x.status==="ACTIVE"?"status-review":x.status==="SHIPPED"?"status-approved":"status-info"}">${escapeHtml(x.status)}</span><strong>${escapeHtml(formatQuantity(x.quantity,x.unit))}</strong>${x.status==="ACTIVE"?`<button class="text-button" data-allocation-action="release" data-allocation-id="${escapeHtml(x.allocationId)}">ปลดจอง</button><button class="text-button" data-allocation-action="ship" data-allocation-id="${escapeHtml(x.allocationId)}">ส่งสินค้า</button>`:""}</div></article>`).join("")}</div>`:""}</section>`;
}

function renderLots() {
  const statusLabel = { DRAFT:"ฉบับร่าง", IN_STOCK:"ในคลัง", RESERVED:"จองแล้ว", SHIPPED:"ส่งแล้ว", VOID:"ยกเลิก", RECALLED:"เรียกคืน" };
  $("#lot-count").textContent = `${state.lots.length} ล็อต`;
  $("#storage-count").textContent = `${state.storageLocations.length} แห่ง`;
  $("#storage-list").innerHTML = state.storageLocations.map((item) => `<article class="farmer-card"><div class="farmer-main"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml([item.locationType,item.zone,item.address].filter(Boolean).join(" · ") || "ไม่ระบุรายละเอียด")}</small></div><span class="status ${item.status === "ACTIVE" ? "status-clear" : "status-info"}">${item.status === "ACTIVE" ? "ใช้งาน" : "พักใช้งาน"}</span></div></article>`).join("") || `<div class="empty-state"><strong>ยังไม่มีสถานที่จัดเก็บ</strong><p>เพิ่มสถานที่ก่อนสร้างล็อตแรก</p></div>`;
  $("#lot-list").innerHTML = state.lots.map((lot) => `<article class="lot-card"><div class="lot-summary"><div><span class="member-code">${escapeHtml(lot.lotId)}</span><h3>${escapeHtml(lot.crop)}</h3><p>${escapeHtml(lot.farmerName)} · ${escapeHtml(lot.plotName)} · ตั้งต้น ${escapeHtml(formatQuantity(lot.quantity, lot.unit))}</p><small>จัดเก็บ: ${escapeHtml(lot.storageLocationName || "ยังไม่ระบุ")} · เก็บเกี่ยว ${new Intl.DateTimeFormat("th-TH", { dateStyle:"medium" }).format(new Date(lot.harvestDate))}</small></div><div class="lot-actions"><span class="status ${["VOID","RECALLED"].includes(lot.inventoryStatus) ? "status-critical" : "status-clear"}">${statusLabel[lot.inventoryStatus]}</span><button class="text-button" data-move-storage="${escapeHtml(lot.lotId)}">เปลี่ยนที่จัดเก็บ</button><a class="text-button" href="/trace/${encodeURIComponent(lot.traceToken)}" target="_blank" rel="noopener">เปิดหน้าตรวจสอบ</a><a class="text-button" href="/api/lots/${encodeURIComponent(lot.lotId)}/qr.png">ดาวน์โหลด QR</a></div></div>${renderLotStandard(lot)}${renderStockPanel(lot)}${renderAllocations(lot)}</article>`).join("") || `<div class="empty-state"><strong>ยังไม่มีล็อต</strong><p>ล็อตแรกสร้างได้จากรายการเก็บเกี่ยวที่อนุมัติและมีข้อมูลครบ</p></div>`;
  const harvests = state.activities.filter((x) => x.activityType?.trim().toLocaleLowerCase("th-TH").includes("เก็บเกี่ยว") && x.riskStatus === "APPROVED" && x.harvestAmount && x.harvestUnit && x.crop && x.plotName && !x.createdLotId);
  $("#harvest-list").innerHTML = harvests.map((item) => `<article class="farmer-card"><div class="farmer-main"><span class="farmer-mark">${escapeHtml(initials(item.farmerName))}</span><div><strong>${escapeHtml(item.farmerName)} · ${escapeHtml(item.crop)}</strong><small>${escapeHtml(item.plotName)} · ${escapeHtml(item.harvestAmount)} ${escapeHtml(item.harvestUnit)}</small></div><button class="button secondary-button" data-create-lot="${escapeHtml(item.activityId)}">สร้างล็อต</button></div></article>`).join("") || `<div class="empty-state"><strong>ยังไม่มีกิจกรรมที่พร้อมสร้างล็อต</strong><p>ตรวจและอนุมัติกิจกรรมเก็บเกี่ยวที่มีพืช แปลง ปริมาณ และหน่วยครบก่อน</p></div>`;
}

async function loadImpactReport() {
  $("#impact-content").innerHTML=`<div class="loading-state" role="status"><span class="spinner"></span> กำลังคำนวณตัวชี้วัด...</div>`;
  try {
    const data=await api("/api/reports/impact");
    $("#impact-measured-at").textContent=`วัดจากข้อมูล ณ ${formatDateTime(data.measuredAt)}`;
    const metrics=[["กิจกรรมทั้งหมด",data.activities.total,"รายการ"],["ข้อมูลบังคับไม่ครบ",data.activities.missingRequired,"รายการ"],["รอตรวจสอบ",data.activities.pendingReview,"รายการ"],["แก้ไขซ้ำ",data.activities.reworkCount,"ครั้ง"],["ข้อมูลนำเข้าซ้ำ",data.imports.duplicateRows,"แถว"],["ข้อผิดพลาดนำเข้า",data.imports.errorRows,"แถว"],["ปัญหายอดคลัง",data.inventory.reconciliationIssues,"ล็อต"],["เวลาตรวจค่ากลาง",data.activities.medianReviewMinutes??"ยังวัดไม่ได้",data.activities.medianReviewMinutes===null?"ยังไม่มีรายการที่ตรวจเสร็จ":"นาที"]];
    $("#impact-content").innerHTML=`<div class="impact-grid">${metrics.map(([label,value,unit])=>`<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(unit)}</small></article>`).join("")}</div><div class="baseline-notice"><strong>ยังไม่มี baseline กระบวนการเดิม</strong><p>ระบบจึงแสดงเฉพาะจำนวนและเวลาที่วัดได้จริง และยังไม่สรุปเปอร์เซ็นต์ว่าดีขึ้นเท่าใด</p></div>`;
    $("#report-grid").innerHTML="";
  } catch(error) { $("#impact-content").innerHTML=`<div class="empty-state"><strong>คำนวณผลไม่ได้</strong><p>${escapeHtml(error.message)}</p><button class="button secondary-button" data-retry-impact>ลองใหม่</button></div>`; }
}

const importStatusMeta = {
  VALID: ["พร้อมนำเข้า", "status-clear"],
  ERROR: ["ต้องแก้ไข", "status-critical"],
  DUPLICATE: ["ข้อมูลซ้ำ", "status-review"],
  SKIPPED: ["ข้ามรายการ", "status-info"],
  COMMITTED: ["นำเข้าแล้ว", "status-approved"]
};

function importStatusBadge(status) {
  const [label, className] = importStatusMeta[status] || [status || "ไม่ทราบสถานะ", "status-info"];
  return `<span class="status ${className}">${escapeHtml(label)}</span>`;
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("เบราว์เซอร์อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่"));
    reader.readAsDataURL(file);
  });
}

function resetImport() {
  state.importFile = null;
  state.importParsed = null;
  state.importPreview = null;
  $("#import-file").value = "";
  $("#import-file-status").textContent = "ยังไม่ได้เลือกไฟล์";
  $("#import-mapping-panel").hidden = true;
  $("#import-preview-panel").hidden = true;
  $("#import-mapping-error").hidden = true;
  $("#import-operation-error").hidden = true;
}

function bestHeader(headers, candidates) {
  return headers.find((header) => candidates.includes(String(header).trim().toLocaleLowerCase("en-US"))) || "";
}

function setMappingOptions(headers) {
  const options = `<option value="">เลือกคอลัมน์...</option>${headers.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join("")}`;
  const type=$("#import-entity-type").value;
  $("#import-mapping-fields").innerHTML=importFieldConfig[type].map(([field,label,required])=>`<label><span>${escapeHtml(label)}${required?' <strong aria-label="จำเป็น">*</strong>':''}</span><select data-map-field="${field}" ${required?'required':''}>${options}</select></label>`).join("");
  const suggestions=type==="FARMER"?{memberCode:["member_code","membercode","farmer_id","รหัสสมาชิก","รหัสเกษตรกร"],displayName:["display_name","displayname","full_name","name","ชื่อเกษตรกร","ชื่อ"]}:{plotId:["plot_id","plotid","รหัสแปลง"],farmerId:["farmer_id","farmerid","รหัสเกษตรกร"],memberCode:["member_code","membercode","รหัสสมาชิก"],name:["plot_name","name","ชื่อแปลง"],crop:["crop","พืช","ชนิดพืช"]};
  for(const [field,candidates] of Object.entries(suggestions)){const select=$(`[data-map-field="${field}"]`);if(select)select.value=bestHeader(headers,candidates);}
}

function currentImportMapping(){return Object.fromEntries($$("[data-map-field]",$("#import-mapping-fields")).map((select)=>[select.dataset.mapField,select.value]).filter(([,value])=>value));}

async function loadImportWorkspace(){
  try{const [templates]=await Promise.all([api("/api/import-mapping-templates"),loadImportReviews()]);state.importTemplates=templates.templates||[];renderImportTemplates();}
  catch(error){$("#import-review-status").textContent=`โหลดคิวตรวจไม่ได้: ${error.message}`;}
}
function renderImportTemplates(){const type=$("#import-entity-type").value;const templates=state.importTemplates.filter((item)=>item.entityType===type);$("#import-template").innerHTML=`<option value="">ยังไม่ใช้แม่แบบ</option>${templates.map((item)=>`<option value="${escapeHtml(item.templateId)}">${escapeHtml(item.name)}</option>`).join("")}`;}

async function loadImportReviews(){const filter=$("#import-review-filter").value;$("#import-review-status").textContent="กำลังโหลดคิวตรวจ...";const result=await api(`/api/imports?limit=50${filter?`&verificationStatus=${encodeURIComponent(filter)}`:''}`);state.importReviewBatches=result.batches||[];const details=await Promise.all(state.importReviewBatches.map(({batch})=>api(`/api/imports/${encodeURIComponent(batch.batchId)}`)));renderImportReviews(details.flatMap((detail)=>detail.rows.map((row)=>({batch:detail.batch,row}))));}
function renderImportReviews(items){$("#import-review-status").textContent=items.length?`พบ ${new Intl.NumberFormat('th-TH').format(items.length)} รายการ`:"ไม่มีรายการในสถานะนี้";$("#import-review-list").innerHTML=items.map(({batch,row})=>{const data=row.normalizedData||{};const title=batch.entityType==="PLOT"?`${data.name||'ไม่ระบุแปลง'} · ${data.crop||'ไม่ระบุพืช'}`:`${data.memberCode||'ไม่ระบุรหัส'} · ${data.displayName||'ไม่ระบุชื่อ'}`;return `<article class="import-review-row"><div class="review-provenance"><strong>${escapeHtml(title)}</strong><span class="status ${row.verificationStatus==='VERIFIED'?'status-clear':row.verificationStatus==='REJECTED'?'status-critical':'status-review'}">${row.verificationStatus==='VERIFIED'?'ยืนยันแล้ว':row.verificationStatus==='REJECTED'?'ส่งกลับแล้ว':'รอตรวจ'}</span><dl><dt>ต้นทาง</dt><dd>${escapeHtml(batch.sourceName)} · แถว ${row.sourceRowNumber}</dd><dt>นำเข้าโดย</dt><dd>${escapeHtml(row.importedBy||batch.createdBy)} · ${row.importedAt?formatDateTime(row.importedAt):'ยังไม่ระบุเวลา'}</dd><dt>ข้อมูลปลายทาง</dt><dd>${escapeHtml(row.targetEntityId||'ยังไม่มี')}</dd>${row.reviewerId?`<dt>ตรวจโดย</dt><dd>${escapeHtml(row.reviewerId)} · ${formatDateTime(row.reviewedAt)}</dd><dt>เหตุผล</dt><dd>${escapeHtml(row.reviewReason||'—')}</dd>`:''}</dl></div><form class="import-review-actions" data-import-review data-batch-id="${escapeHtml(batch.batchId)}" data-row-id="${escapeHtml(row.importRowId)}"><label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500" placeholder="อ้างอิงเอกสารหรือสิ่งที่ตรวจพบ"></textarea></label><div><button class="button secondary-button" name="decision" value="reject" type="submit">ส่งกลับแก้ไข</button><button class="button button-primary" name="decision" value="verify" type="submit">ยืนยันข้อมูล</button></div><p class="form-error" role="alert" hidden></p></form></article>`;}).join('')||`<div class="empty-state"><strong>ไม่มีงานค้าง</strong><p>เปลี่ยนตัวกรองเพื่อดูรายการที่ยืนยันหรือส่งกลับแล้ว</p></div>`;}

async function parseImportFile(file) {
  const allowed = /\.(csv|xlsx)$/i;
  if (!allowed.test(file.name)) throw new Error("รองรับเฉพาะไฟล์ .csv และ .xlsx เท่านั้น");
  if (file.size > 2 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 2 MB กรุณาแบ่งไฟล์แล้วลองใหม่");
  if (!file.size) throw new Error("ไฟล์ว่าง กรุณาเลือกไฟล์ที่มีหัวคอลัมน์และข้อมูลอย่างน้อย 1 แถว");
  state.importFile = file;
  const status = $("#import-file-status");
  status.innerHTML = `<span class="spinner" aria-hidden="true"></span> กำลังอ่าน ${escapeHtml(file.name)}...`;
  const parsed = await api("/api/imports/parse", { method:"POST", body:JSON.stringify({ sourceName:file.name, contentBase64:await fileAsBase64(file) }) });
  if (!Array.isArray(parsed.headers) || !parsed.headers.length || !Array.isArray(parsed.rows)) throw new Error("ระบบอ่านโครงสร้างไฟล์ไม่ได้ กรุณาตรวจว่ามีหัวคอลัมน์ในแถวแรก");
  state.importParsed = parsed;
  setMappingOptions(parsed.headers);
  $("#import-source-summary").textContent = `${parsed.sourceType || file.name.split(".").pop().toUpperCase()} · ${parsed.rows.length} แถว`;
  status.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${new Intl.NumberFormat("th-TH").format(parsed.rows.length)} แถว · ${new Intl.NumberFormat("th-TH").format(parsed.headers.length)} คอลัมน์</span>`;
  $("#import-mapping-panel").hidden = false;
  $("#import-preview-panel").hidden = true;
  $("#import-mapping-title").focus?.();
}

function renderImportPreview() {
  const { batch, rows, reused } = state.importPreview;
  const skipped = rows.filter((row) => row.rowStatus === "SKIPPED").length;
  $("#import-summary").innerHTML = [
    [batch.totalRows, "ทั้งหมด", "ทุกแถวที่ตรวจ"],
    [batch.validRows, "พร้อมนำเข้า", "ข้อมูลบังคับครบ"],
    [batch.errorRows, "ต้องแก้ไข", "ดูเหตุผลรายแถว"],
    [batch.duplicateRows, "ข้อมูลซ้ำ", "จะไม่สร้างสมาชิกซ้ำ"],
    [skipped, "ข้าม", "ไม่ถูกนำเข้า"]
  ].map(([value,label,detail]) => `<article><strong>${new Intl.NumberFormat("th-TH").format(value)}</strong><span>${label}</span><small>${detail}</small></article>`).join("");
  $("#import-preview-note").textContent = reused ? "ไฟล์นี้เคยตรวจแล้ว ระบบแสดงผลชุดเดิมโดยไม่สร้างรายการซ้ำ" : "ผลตรวจถูกพักไว้เป็นชุดนำเข้า ยังไม่มีข้อมูลถูกบันทึกเข้าทะเบียน";
  $("#import-error-report").href = `/api/imports/${encodeURIComponent(batch.batchId)}/errors.csv`;
  $("#import-error-report").hidden = batch.errorRows + batch.duplicateRows === 0;
  $("#commit-import").disabled = batch.status !== "READY" || batch.validRows === 0;
  $("#commit-import").title = batch.status === "READY" ? "" : "ต้องแก้ข้อมูลผิดพลาดและข้อมูลซ้ำในไฟล์ก่อน";
  $("#import-reason").disabled = batch.status !== "READY";
  $("#import-result-filter").value = "";
  renderImportRows();
  $("#import-preview-panel").hidden = false;
  $("#import-preview-panel").scrollIntoView({ behavior:"smooth", block:"start" });
}

function renderImportRows() {
  const rows = state.importPreview?.rows || [];
  const filter = $("#import-result-filter").value;
  const visible = filter ? rows.filter((row) => row.rowStatus === filter) : rows;
  $("#import-result-count").textContent = `แสดง ${new Intl.NumberFormat("th-TH").format(visible.length)} จาก ${new Intl.NumberFormat("th-TH").format(rows.length)} แถว`;
  $("#import-result-rows").innerHTML = visible.map((row) => {
    const data = row.normalizedData || {};
    const issues = Array.isArray(row.issues) ? row.issues : [];
    const plot=state.importPreview?.batch?.entityType==="PLOT";
    return `<tr><td data-label="แถว"><strong>${new Intl.NumberFormat("th-TH").format(row.sourceRowNumber)}</strong></td><td data-label="รหัสอ้างอิง">${escapeHtml(plot?(data.plotId||data.memberCode||data.farmerId||"—"):(data.memberCode||"—"))}</td><td data-label="ชื่อรายการ">${escapeHtml(plot?(data.name||"—"):(data.displayName||"—"))}${plot&&data.crop?`<small>${escapeHtml(data.crop)}</small>`:""}</td><td data-label="ผลตรวจ">${importStatusBadge(row.rowStatus)}</td><td data-label="รายละเอียด / วิธีแก้" class="import-issue">${issues.length ? issues.map((issue) => `<span>${escapeHtml(issue.message)}</span>`).join("") : "ข้อมูลบังคับครบ พร้อมนำเข้า"}</td></tr>`;
  }).join("");
  $("#import-results-empty").hidden = visible.length > 0;
  $(".import-table-wrap").hidden = visible.length === 0;
}

function showImportOperationError(message) {
  const box = $("#import-operation-error");
  $("p", box).textContent = message;
  box.hidden = false;
  box.focus?.();
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
  if(mode==="lot-standard"||mode==="allocation-create"||mode==="allocation-action"){
    $("#entity-form-error").hidden=true;
    $("#entity-dialog-title").textContent=mode==="lot-standard"?`บันทึกผลมาตรฐาน · ${extra.lotId}`:mode==="allocation-create"?`สร้างการจัดสรร · ${extra.lotId}`:`${extra.action==="ship"?"ส่งสินค้า":"ปลดจอง"} · ${extra.allocationId}`;
    $("#entity-form-fields").innerHTML=mode==="lot-standard"?`<label>สถานะตามนิยามที่อนุมัติ<select name="definitionId" required><option value="">เลือกสถานะ...</option>${state.standardDefinitions.filter((x)=>x.active).map((x)=>`<option value="${escapeHtml(x.definitionId)}">${escapeHtml(x.code)} · ${escapeHtml(x.name)}</option>`).join("")}</select></label><label>หลักฐานอ้างอิง<input name="evidenceReference" required maxlength="500" placeholder="เลขเอกสารหรือลิงก์หลักฐาน"></label><label>เวลาที่ผลมีผล<input type="datetime-local" name="effectiveAt" required value="${new Date().toLocaleString("sv-SE",{timeZone:"Asia/Bangkok"}).slice(0,16).replace(" ","T")}"></label><label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500"></textarea></label>`:mode==="allocation-create"?`<label>ปริมาณ (${escapeHtml(extra.unit)})<input type="number" name="quantity" min="0.000001" max="${escapeHtml(extra.maximum)}" step="any" required></label><label>ผู้รับผิดชอบ<input name="responsibleName" required minlength="2" maxlength="120"></label><label>ผู้รับสินค้า<input name="recipientName" required minlength="2" maxlength="120"></label><label>เลขอ้างอิงคำสั่งซื้อ<input name="orderReference" required maxlength="120"></label><label>เอกสารอ้างอิง<input name="documentReference" maxlength="200"></label><label>วันหมดอายุการจอง<input type="datetime-local" name="expiresAt" required></label><label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500"></textarea></label>`:`<label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500"></textarea></label>`;
    $("#entity-dialog").showModal();$("#entity-form-fields input, #entity-form-fields select, #entity-form-fields textarea").focus();return;
  }
  const isFarmer = mode === "farmer";
  const isLotStatus = mode === "lot-status";
  const isStorage = mode === "storage"; const isCreateLot=mode === "create-lot"; const isMoveStorage=mode === "move-storage"; const isStockMovement=mode === "stock-movement";
  $("#entity-dialog-title").textContent = isFarmer ? "เพิ่มเกษตรกร" : isLotStatus ? "ยืนยันการเปลี่ยนสถานะล็อต" : isStorage ? "เพิ่มสถานที่จัดเก็บ" : isCreateLot ? "เลือกสถานที่จัดเก็บ" : isMoveStorage ? "ย้ายสถานที่จัดเก็บ" : isStockMovement ? `${stockMovementMeta[extra.type]?.[0] || "บันทึกยอด"} · ${extra.lotId}` : "เพิ่มแปลง";
  $("#entity-form-error").hidden = true;
  $("#entity-form-fields").innerHTML = isFarmer
    ? `<label>รหัสสมาชิก<input name="memberCode" required minlength="2" maxlength="30" placeholder="เช่น M001" pattern="[A-Za-z0-9_-]+"><small>ใช้รหัสนี้สำหรับคำสั่งลงทะเบียนใน LINE</small></label><label>ชื่อเกษตรกร<input name="displayName" required minlength="2" maxlength="120" placeholder="ชื่อและนามสกุล"></label>`
    : isLotStatus ? `<p>เปลี่ยนสถานะล็อตเป็น <strong>${escapeHtml(extra.statusLabel || extra.status)}</strong></p><label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500" placeholder="ระบุเหตุผลอย่างน้อย 5 ตัวอักษร"></textarea></label>`
    : isStorage ? `<label>ชื่อสถานที่<input name="name" required minlength="2" maxlength="120" placeholder="เช่น คลังกลางศรีสะเกษ"></label><label>ประเภท<input name="locationType" maxlength="80" placeholder="เช่น โกดัง หรือห้องเย็น"></label><label>โซน<input name="zone" maxlength="80" placeholder="เช่น อาคาร A ชั้น 1"></label><label>ที่อยู่<textarea name="address" maxlength="300"></textarea></label>`
    : (isCreateLot || isMoveStorage) ? `<label>สถานที่จัดเก็บ<select name="storageLocationId" required><option value="">เลือกสถานที่...</option>${state.storageLocations.filter((x)=>x.status==="ACTIVE").map((x)=>`<option value="${escapeHtml(x.locationId)}">${escapeHtml(x.name)}</option>`).join("")}</select></label>${isMoveStorage ? '<label>เหตุผลในการย้าย<textarea name="reason" required minlength="5" maxlength="500"></textarea></label>' : ''}`
    : isStockMovement ? `${extra.type === "RECALL" ? `<p class="stock-dialog-warning">การเรียกคืนจะทำให้ยอดพร้อมใช้เป็นศูนย์ทันที แต่ยังเก็บยอดคงเหลือจริงไว้เพื่อตรวจสอบย้อนหลัง</p><input type="hidden" name="quantity" value="1">` : `<label>ปริมาณ (${escapeHtml(extra.unit)})<input name="quantity" type="number" ${extra.type === "ADJUST" ? "" : `min="0.000001" max="${escapeHtml(extra.maximum)}"`} step="any" required inputmode="decimal" aria-describedby="stock-quantity-hint"><small id="stock-quantity-hint">${extra.type === "ADJUST" ? "กรอกค่าบวกเพื่อเพิ่ม หรือค่าลบเพื่อลดยอด" : `กรอกได้ไม่เกิน ${escapeHtml(formatQuantity(extra.maximum, extra.unit))}`}</small></label>`}<label>เหตุผล<textarea name="reason" required minlength="5" maxlength="500" placeholder="ระบุที่มา เลขเอกสาร หรือเหตุผลอย่างน้อย 5 ตัวอักษร"></textarea></label>`
    : `<label>ชื่อแปลง<input name="name" required maxlength="120" placeholder="เช่น แปลงเหนือ"></label><label>พืชหลัก<input name="crop" required maxlength="120" placeholder="เช่น หอมแดง"></label>`;
  $("#entity-dialog").showModal();
  $("#entity-form-fields input:not([type=hidden]), #entity-form-fields select, #entity-form-fields textarea").focus();
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
document.addEventListener("click", (event) => { if(event.target.closest("[data-retry-impact]")) loadImpactReport(); });
document.addEventListener("click", (event) => {
  const viewTrigger = event.target.closest("[data-view]");
  if (viewTrigger) showView(viewTrigger.dataset.view);
  const plotTrigger = event.target.closest("[data-add-plot]");
  if (plotTrigger) openEntityDialog("plot", plotTrigger.dataset.addPlot);
  const lotTrigger = event.target.closest("[data-create-lot]");
  if (lotTrigger) createLot(lotTrigger.dataset.createLot, lotTrigger);
  const moveTrigger=event.target.closest("[data-move-storage]");
  if(moveTrigger) openEntityDialog("move-storage",undefined,{lotId:moveTrigger.dataset.moveStorage});
  const retryLots=event.target.closest("[data-retry-lots]");
  if(retryLots) loadLots();
  const retryStock=event.target.closest("[data-retry-stock]");
  if(retryStock) loadLotStock(retryStock.dataset.retryStock, retryStock);
  const stockTrigger=event.target.closest("[data-stock-action]");
  if(stockTrigger) {
    const lot=state.lots.find((item)=>item.lotId===stockTrigger.dataset.lotId);
    const balance=state.lotStock[stockTrigger.dataset.lotId]?.balance;
    if(!lot || !balance) return;
    const type=stockTrigger.dataset.stockAction;
    const maximum=type==="RESERVE"?balance.available:type==="RELEASE"?balance.reserved:balance.onHand;
    openEntityDialog("stock-movement",undefined,{lotId:lot.lotId,type,unit:lot.unit,maximum,reference:`dashboard:${lot.lotId}:${type}:${Date.now()}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`});
  }
  const standardTrigger=event.target.closest("[data-set-standard]");
  if(standardTrigger) openEntityDialog("lot-standard",undefined,{lotId:standardTrigger.dataset.setStandard});
  const allocationCreate=event.target.closest("[data-create-allocation]");
  if(allocationCreate){const balance=state.lotStock[allocationCreate.dataset.createAllocation]?.balance;if(balance)openEntityDialog("allocation-create",undefined,{lotId:allocationCreate.dataset.createAllocation,unit:balance.unit,maximum:balance.available});}
  const allocationAction=event.target.closest("[data-allocation-action]");
  if(allocationAction) openEntityDialog("allocation-action",undefined,{allocationId:allocationAction.dataset.allocationId,action:allocationAction.dataset.allocationAction});
});
async function loadLotStock(lotId, button) {
  if (button) button.disabled=true;
  state.lotStock[lotId]={status:"loading"}; renderLots();
  try { state.lotStock[lotId]={status:"ready",...(await api(`/api/lots/${encodeURIComponent(lotId)}/stock`))}; }
  catch(error) { state.lotStock[lotId]={status:"error",error:error.message}; }
  renderLots();
}
async function createLot(activityId, button) {
  if(!state.storageLocations.some((item)=>item.status==="ACTIVE")){ showToast("กรุณาเพิ่มสถานที่จัดเก็บก่อนสร้างล็อต"); return; }
  openEntityDialog("create-lot",undefined,{activityId});
}
$("#lot-list").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-lot-status]");
  if (!select || !select.value) return;
  openEntityDialog("lot-status", undefined, { lotId:select.dataset.lotStatus, status:select.value, statusLabel:select.selectedOptions[0].textContent });
  select.value = "";
});
$("#add-farmer-button").addEventListener("click", () => openEntityDialog("farmer"));
$("#add-storage-button").addEventListener("click", () => openEntityDialog("storage"));
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
    const isStorage=state.formMode.mode === "storage"; const isCreateLot=state.formMode.mode === "create-lot"; const isMoveStorage=state.formMode.mode === "move-storage"; const isStockMovement=state.formMode.mode === "stock-movement"; const isLotStandard=state.formMode.mode==="lot-standard"; const isAllocationCreate=state.formMode.mode==="allocation-create"; const isAllocationAction=state.formMode.mode==="allocation-action";
    const stockQuantity=Number(values.quantity);
    if(isStockMovement && (!Number.isFinite(stockQuantity) || stockQuantity===0 || (state.formMode.type!=="ADJUST" && stockQuantity<0))) throw new Error(state.formMode.type === "ADJUST" ? "ปริมาณปรับยอดต้องไม่เป็นศูนย์" : "ปริมาณต้องมากกว่า 0");
    const reference=`dashboard:${Date.now()}:${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`;
    const body = isFarmer ? values : isLotStatus ? { reason:values.reason, status:state.formMode.status } : isCreateLot ? {activityId:state.formMode.activityId,storageLocationId:values.storageLocationId} : isMoveStorage ? {storageLocationId:values.storageLocationId,reason:values.reason} : isStockMovement ? {type:state.formMode.type,quantity:stockQuantity,unit:state.formMode.unit,reason:values.reason,reference:state.formMode.reference} : isLotStandard?{definitionId:values.definitionId,reason:values.reason,evidenceReference:values.evidenceReference,effectiveAt:new Date(values.effectiveAt).toISOString()}:isAllocationCreate?{quantity:Number(values.quantity),unit:state.formMode.unit,responsibleName:values.responsibleName,recipientName:values.recipientName,orderReference:values.orderReference,...(values.documentReference?{documentReference:values.documentReference}:{}),expiresAt:new Date(values.expiresAt).toISOString(),reason:values.reason,reference}:isAllocationAction?{reason:values.reason,reference}:isStorage ? values : { ...values, farmerId: state.formMode.farmerId };
    const path=isFarmer?"/api/farmers":isLotStatus?`/api/lots/${encodeURIComponent(state.formMode.lotId)}/status`:isStorage?"/api/storage-locations":isCreateLot?"/api/lots":isMoveStorage?`/api/lots/${encodeURIComponent(state.formMode.lotId)}/storage`:isStockMovement?`/api/lots/${encodeURIComponent(state.formMode.lotId)}/stock-movements`:isLotStandard?`/api/lots/${encodeURIComponent(state.formMode.lotId)}/standard-history`:isAllocationCreate?`/api/lots/${encodeURIComponent(state.formMode.lotId)}/allocations`:isAllocationAction?`/api/allocations/${encodeURIComponent(state.formMode.allocationId)}/${state.formMode.action}`:"/api/plots";
    await api(path, { method:(isLotStatus||isMoveStorage) ? "PATCH" : "POST", body:JSON.stringify(body) });
    $("#entity-dialog").close();
    showToast(isFarmer ? "เพิ่มเกษตรกรแล้ว" : isLotStatus ? "อัปเดตสถานะล็อตแล้ว" : isStorage ? "เพิ่มสถานที่จัดเก็บแล้ว" : isCreateLot ? "สร้างล็อตและบันทึกสถานที่แล้ว" : isMoveStorage ? "ย้ายสถานที่จัดเก็บแล้ว" : isStockMovement ? "บันทึกการเคลื่อนไหวและ Snapshot แล้ว" : "เพิ่มแปลงแล้ว");
    if (isLotStatus||isStorage||isCreateLot||isMoveStorage||isLotStandard||isAllocationCreate||isAllocationAction) await loadLots(); else if(isStockMovement) await loadLotStock(state.formMode.lotId); else await loadFarmers();
  } catch (error) { errorElement.textContent = error.message; errorElement.hidden = false; }
  finally { submitButton.disabled = false; }
});
$("#activity-search").addEventListener("input", () => { clearTimeout(filterActivities.timer); filterActivities.timer = setTimeout(filterActivities, 250); });
$("#risk-filter").addEventListener("change", filterActivities);
$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await parseImportFile(file); }
  catch (error) { resetImport(); $("#import-file-status").innerHTML = `<span class="status status-critical">อ่านไฟล์ไม่ได้</span><span>${escapeHtml(error.message)}</span>`; }
});
const importDropzone = $("#import-dropzone");
["dragenter", "dragover"].forEach((type) => importDropzone.addEventListener(type, (event) => { event.preventDefault(); importDropzone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((type) => importDropzone.addEventListener(type, (event) => { event.preventDefault(); importDropzone.classList.remove("dragging"); }));
importDropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try { await parseImportFile(file); }
  catch (error) { resetImport(); $("#import-file-status").innerHTML = `<span class="status status-critical">อ่านไฟล์ไม่ได้</span><span>${escapeHtml(error.message)}</span>`; }
});
$("#reset-import").addEventListener("click", () => { resetImport(); $("#import-file").focus(); });
$("#import-mapping-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorElement = $("#import-mapping-error");
  const button = $("#preview-import");
  const entityType=$("#import-entity-type").value;
  const mapping=currentImportMapping();
  errorElement.hidden = true;
  if (!state.importParsed || !state.importFile) return;
  const selected=Object.values(mapping);if(new Set(selected).size!==selected.length){errorElement.textContent="หนึ่งคอลัมน์จับคู่ได้เพียงหนึ่งช่องข้อมูล";errorElement.hidden=false;return;}
  if(entityType==="PLOT"&&!mapping.farmerId&&!mapping.memberCode){errorElement.textContent="แปลงต้องอ้างอิงรหัสเกษตรกรหรือรหัสสมาชิก";errorElement.hidden=false;return;}
  button.disabled = true;
  button.textContent = "กำลังตรวจข้อมูล...";
  try {
    state.importPreview = await api("/api/imports/preview", { method:"POST", body:JSON.stringify({ sourceName:state.importFile.name, sourceType:state.importParsed.sourceType, entityType, rows:state.importParsed.rows, mapping }) });
    renderImportPreview();
  } catch (error) { errorElement.textContent = error.message; errorElement.hidden = false; }
  finally { button.disabled = false; button.textContent = "ตรวจข้อมูลก่อนนำเข้า"; }
});
$("#import-entity-type").addEventListener("change",()=>{renderImportTemplates();if(state.importParsed)setMappingOptions(state.importParsed.headers);});
$("#import-template").addEventListener("change",(event)=>{const template=state.importTemplates.find((item)=>item.templateId===event.target.value);$("#import-template-name").value=template?.name||"";if(!template)return;for(const [field,header] of Object.entries(template.mapping)){const select=$(`[data-map-field="${field}"]`);if(select&&[...select.options].some((option)=>option.value===header))select.value=header;}});
$("#save-import-template").addEventListener("click",async(event)=>{if(!state.importParsed)return showToast("เลือกไฟล์และจับคู่คอลัมน์ก่อน");const selected=$("#import-template").value;const existing=state.importTemplates.find((item)=>item.templateId===selected);const name=$("#import-template-name").value.trim();if(!name){$("#import-template-name").focus();return showToast("ระบุชื่อแม่แบบก่อนบันทึก");}event.currentTarget.disabled=true;try{const body={name,sourceName:state.importFile.name,entityType:$("#import-entity-type").value,headers:state.importParsed.headers,mapping:currentImportMapping()};const result=await api(selected?`/api/import-mapping-templates/${encodeURIComponent(selected)}`:"/api/import-mapping-templates",{method:selected?"PATCH":"POST",body:JSON.stringify(body)});if(existing)Object.assign(existing,result.template);else state.importTemplates.push(result.template);renderImportTemplates();$("#import-template").value=result.template.templateId;$("#import-template-name").value=result.template.name;showToast(selected?"อัปเดตแม่แบบแล้ว":"บันทึกแม่แบบแล้ว");}catch(error){showToast(error.message);}finally{event.currentTarget.disabled=false;}});
$("#refresh-import-reviews").addEventListener("click",loadImportReviews);
$("#import-review-filter").addEventListener("change",loadImportReviews);
$("#import-review-list").addEventListener("submit",async(event)=>{const form=event.target.closest("[data-import-review]");if(!form)return;event.preventDefault();const submitter=event.submitter;const reason=new FormData(form).get("reason")?.trim();const error=$(".form-error",form);if(!reason||reason.length<5){error.textContent="ระบุเหตุผลอย่างน้อย 5 ตัวอักษร";error.hidden=false;return;}$$('button',form).forEach((button)=>button.disabled=true);error.hidden=true;try{await api(`/api/imports/${encodeURIComponent(form.dataset.batchId)}/rows/${encodeURIComponent(form.dataset.rowId)}/${submitter.value}`,{method:"POST",body:JSON.stringify({reason})});showToast(submitter.value==="verify"?"ยืนยันข้อมูลแล้ว":"ส่งกลับรายการแล้ว");await loadImportReviews();}catch(apiError){error.textContent=apiError.message;error.hidden=false;$$('button',form).forEach((button)=>button.disabled=false);}});
$("#import-result-filter").addEventListener("change", renderImportRows);
$("#commit-import").addEventListener("click", async (event) => {
  const reason = $("#import-reason").value.trim();
  if (reason.length < 5) { showImportOperationError("กรุณาระบุเหตุผลการนำเข้าอย่างน้อย 5 ตัวอักษร"); $("#import-reason").focus(); return; }
  const batch = state.importPreview?.batch;
  if (!batch) return;
  event.currentTarget.disabled = true;
  $("#import-operation-error").hidden = true;
  try {
    const result = await api(`/api/imports/${encodeURIComponent(batch.batchId)}/commit`, { method:"POST", body:JSON.stringify({ reason }) });
    state.importPreview.batch = result.batch || { ...batch, status:"COMMITTED" };
    showToast(`นำเข้า${batch.entityType==="PLOT"?"แปลง":"สมาชิก"}สำเร็จ ${result.committedRows ?? batch.validRows} รายการ`);
    $("#commit-import").textContent = "นำเข้าเรียบร้อยแล้ว";
    $("#import-reason").disabled = true;
  } catch (error) { showImportOperationError(error.message); event.currentTarget.disabled = false; }
});
$("#retry-import-operation").addEventListener("click", () => { $("#import-operation-error").hidden = true; $("#commit-import").click(); });
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
