# Agent Coordination Board

> ใช้เป็นสถานะกลางสำหรับงานที่ทำพร้อมกัน ทุกเอเจนต์ต้องอ่านก่อนเริ่ม อัปเดตเฉพาะแถวของตน และบันทึกสัญญาเชื่อมต่อที่มีผลกับผู้อื่น

อัปเดตล่าสุด: 2026-10-19

## กติกา

1. ห้ามแก้ `FEATURES.md`, `TASKS.md`, `WORKLOG.md` ระหว่างทำงานย่อย ให้เอเจนต์หลักรวมและอัปเดตครั้งเดียว
2. ห้ามแก้ไฟล์นอก Ownership โดยไม่บันทึกคำขอในส่วน Cross-agent notes
3. ทุก API/domain contract ใหม่ต้องบันทึกใน Contract changes ก่อนใช้ข้ามสายงาน
4. ทุกสายงานต้องรัน test ที่เกี่ยวข้องและบันทึกผลก่อนส่งมอบ
5. ห้าม commit หรือ push แยก เอเจนต์หลักจะตรวจ รวม ทดสอบ และ deploy

## Current sprint

| Workstream | Owner | Scope | Files owned | Status |
|---|---|---|---|---|
| Import backend | import-backend | CSV/XLSX parsing, validation, preview/commit/error report | `src/services/import-service.ts`, import API/backend tests, package dependencies | VERIFIED |
| Import experience | import-ui | Import Preview UI, mapping, accessible responsive states | `public/index.html`, `public/app.js`, `public/styles.css` | VERIFIED |
| Stock ledger | stock-ledger | append-only movements, balances, guards, backend tests | domain/repository/stock service and stock API files | VERIFIED |
| Integration | root | contracts, conflict resolution, docs, full verification, deploy | shared docs and final integration | VERIFIED |

## Sprint 2 — Operational completion

| Workstream | Owner | Scope | Files owned | Status |
|---|---|---|---|---|
| Stock operations UI | stock-ui | balances, movement history, reserve/release/ship/adjust/recall actions | `public/index.html`, `public/app.js`, `public/styles.css`, visual script | VERIFIED |
| Import provenance | import-review | verification metadata, review/verify APIs and tests | import/domain/repository/backend test files | VERIFIED |
| Import templates | import-template | reusable source mapping templates and tests | new template service/types/repository/API test files | VERIFIED |
| Sprint 2 integration | root | reconcile contracts, docs, full test/visual/deploy | shared project docs | VERIFIED |

### Sprint 2 rules

- ห้ามแก้ `FEATURES.md`, `TASKS.md`, `WORKLOG.md` ระหว่างทำงานย่อย; root อัปเดตหลังรวม
- Stock UI ใช้ API ledger ที่มีอยู่และห้ามแก้ backend หากไม่บันทึก endpoint gap ก่อน
- Import provenance และ template ต้องเพิ่มแบบ additive และรักษา backup compatibility
- ทุก owner บันทึก contract, migration/header ที่เพิ่ม และผลทดสอบในไฟล์นี้ก่อนส่งมอบ

## Sprint 3 — MVP closure

| Workstream | Owner | Scope | Files owned | Status |
|---|---|---|---|---|
| Import completion | import-review | Review Queue UI, mapping template UI, PLOT import expansion | import UI + import service/routes/tests | VERIFIED |
| Allocation lifecycle | stock-ledger | reservation owner/reference/expiry, expiry release worker, guards and UI contract | allocation domain/service/repository/routes/tests | VERIFIED: awaiting root integration |
| Standards and impact | stock-ui | configurable lot standards/history, eligibility, measured impact dashboard | standards/impact backend+UI+tests | VERIFIED (build handoff noted) |
| Operations/evidence/integration | root | push/deploy, cron/monitoring/runbook, process map/test report/pilot pack, final verification | ops config, docs and shared integration | IN_PROGRESS |

### Sprint 3 constraints

- ห้ามสร้างกฎ T1/T2 หรือผล impact สมมติ: ระบบเก็บ controlled definitions/measurements และแสดง `รอ ICS กำหนด` หรือ `ยังไม่มี baseline` ได้
- การ import PLOT ต้องอ้าง `farmer_id/member_code` ที่มีจริง และ preview ห้ามเขียนข้อมูล production
- งาน allocation ต้องเป็น append-only และ expiry release ต้อง idempotent
- ทุก UI ใช้ DESIGN.md/Impeccable และทุก owner อัปเดต contract/verification ในไฟล์นี้
- ห้ามแก้ `FEATURES.md`, `TASKS.md`, `WORKLOG.md`; root รวมครั้งเดียวก่อน commit

## Contract changes

- Lot standards are controlled data, never seeded assumptions: `LotStandardDefinition { definitionId, code:T1|T2|PASSED|ON_HOLD|REJECTED, name, description, active, createdBy/At, updatedBy/At }` and append-only `LotStandardHistory { historyId, lotId, definitionId, status, actorId, reason, evidenceReference, effectiveAt, recordedAt }`.
- Standards API: `GET/POST /api/standard-definitions`, `PATCH /api/standard-definitions/:definitionId`, `GET /api/lots/:lotId/standard`, `POST /api/lots/:lotId/standard-history`. Definitions require ADMIN; lot decisions require REVIEWER or ADMIN. A decision cannot use an absent/inactive definition. `availabilityEligible` is `null` before a decision, false for ON_HOLD/REJECTED, true otherwise. Stock RESERVE/SHIP routes reject false eligibility.
- Impact API: `GET /api/reports/impact` computes observed activity totals, missing required data, pending review, manual-correction count, median completed-review time, import duplicate/error rows, lot/movement counts and stock reconciliation issues. `baseline` is explicitly `null`; the UI must not infer improvement percentages.
- Google Sheets adds `LotStandardDefinitions` and `LotStandardHistory`; backup export/merge includes both and deduplicates append-only history by `historyId`.

- Sprint 3 Import completion (additive): `ImportBatch.entityType` expands to `FARMER|PLOT`. `POST /api/imports/preview` accepts `entityType`; PLOT mapping fields are `plotId, farmerId, memberCode, name, crop, status, areaRai, gpsLat, gpsLng`. Every PLOT row must resolve exactly one existing farmer by `farmerId` or `memberCode`, requires `name` and `crop`, and rejects duplicate `plotId` or duplicate farmer+plot name. Preview only writes staging records; commit rechecks farmer and duplicates before creating Plots.
- Import mapping templates expand additively to `entityType:FARMER|PLOT` and use the corresponding controlled mapping fields. Existing FARMER templates remain valid.
- Import Review Queue UI consumes `GET /api/imports?verificationStatus=` and `GET /api/imports/:batchId`; row decisions use existing `/verify` and `/reject` endpoints and always require a reason. Provenance detail shows source file/type/row, importer/imported time, target ID, reviewer/reviewed time and reason.

- Import provenance review contract (Sprint 2, additive): `ImportRow` gains `imported_by`, `imported_at`, `verification_status` (`NOT_REQUIRED|PENDING|VERIFIED|REJECTED`), `reviewer_id`, `reviewed_at`, and `review_reason`. Preview rows default to `NOT_REQUIRED`; commit stamps importer/time and moves them to `PENDING`. Review changes provenance metadata only and never deletes or silently edits the target entity.
- Import provenance APIs: `GET /api/imports?verificationStatus=&limit=` lists batches with aggregate verification counts; `POST /api/imports/:batchId/rows/:rowId/verify` and `/reject` accept `{ reason }`, require a committed row/target entity, and write before/after audit snapshots. Repeating the same decision is idempotent; changing a completed decision requires a new reason and remains visible in audit history.
- Google Sheets `ImportRows` adds headers `imported_by`, `imported_at`, `verification_status`, `reviewer_id`, `reviewed_at`, `review_reason`. Missing legacy values normalize to `NOT_REQUIRED`; no existing column is renamed or removed.

- Existing preview endpoint: `POST /api/imports/preview` accepts `{ sourceName, rows }` for FARMER staging.
- Import UI may be developed against the existing endpoint; backend owner must record any replacement request/response shape here.
- Stock ledger must remain repository-agnostic and preserve audit before/after snapshots.
- Stock contract: `StockMovement { movementId, lotId, movementType, quantity, unit, actorId, reason, reference, occurredAt }`; types are `RECEIVE|RESERVE|RELEASE|SHIP|ADJUST|RECALL`. `(lotId, reference)` is the idempotency key.
- Stock balance response: `{ lotId, unit, onHand, reserved, available, recalled, updatedAt? }`. `SHIP` consumes reserved stock first; `RECALL` makes available zero without erasing physical on-hand.
- Proposed API: `GET /api/lots/:lotId/stock` returns `{ balance, movements }`; `POST /api/lots/:lotId/stock-movements` accepts `{ type, quantity, unit, reason, reference }` and returns `{ movement, balance, created }` (201 new, 200 idempotent replay).
- Lot creation must call idempotent RECEIVE using reference `lot-create:<activityId>` after persisting/linking the lot, and include `balance` in the 201 response.
- Import mapping template contract: `ImportMappingTemplate { templateId, name, sourceName, entityType:"FARMER"|"PLOT", headers:string[], mapping, createdBy, updatedBy, createdAt, updatedAt }`.
- Template API: `GET /api/import-mapping-templates`; `POST /api/import-mapping-templates` accepts `{ name, sourceName, entityType, headers, mapping }`; `PATCH /api/import-mapping-templates/:templateId` accepts the same fields partially. Write routes are ADMIN-only; every mutation writes before/after audit.
- Template validation requires `memberCode+displayName` for FARMER, or `name+crop` and one of `farmerId/memberCode` for PLOT; rejects cross-entity fields, duplicate mapped source headers, and mapped headers absent from `headers`. Google Sheets uses the existing additive `ImportMappingTemplates` sheet.
- Allocation contract (Sprint 3): append-only `AllocationEvent { eventId, allocationId, lotId, eventType:ALLOCATE|RELEASE|SHIP|EXPIRE, quantity, unit, responsibleName, recipientName, orderReference, documentReference?, expiresAt, reason, reference, actorId, stockMovementId, occurredAt }`. State is derived as `ACTIVE|RELEASED|SHIPPED|EXPIRED`; terminal events never overwrite prior evidence.
- Allocation idempotency: event `reference` is globally unique through the repository path; linked ledger references are deterministic (`allocation:<allocationId>:reserve|release|ship|expire`). A terminal allocation rejects a different follow-up, while replay of the same event reference returns the existing result.
- Allocation API/UI contract: `GET /api/allocations?lotId=&status=` returns `{ allocations }`; `POST /api/lots/:lotId/allocations` accepts `{ quantity,unit,responsibleName,recipientName,orderReference,documentReference?,expiresAt,reason,reference }`; `POST /api/allocations/:allocationId/release` and `/ship` accept `{ reason,reference }`. Responses include `{ allocation,balance,created }` (201 new, 200 replay). `POST /api/system/allocations/process-expired` returns `{ processed,allocations }` and is intended for the authenticated cron/operations worker.
- Google Sheets adds append-only `AllocationEvents` headers: `event_id,allocation_id,lot_id,event_type,quantity,unit,responsible_name,recipient_name,order_reference,document_reference,expires_at,reason,reference,actor_id,stock_movement_id,occurred_at`.

## Cross-agent notes

- Import backend should avoid editing dashboard files.
- Import UI should avoid changing backend/domain code; document missing endpoint needs below.
- Stock ledger should avoid editing dashboard files in this pass; expose backend contracts for later UI integration.
- Stock UI consumes the existing ledger endpoints without backend changes. Client references are created once when an operation opens and reused on retry, preserving API idempotency after a lost response.
- Sprint 3 standards/impact owner will edit `public/app.js`, `public/index.html`, and `public/styles.css` for lot-standard controls and measured reports. Import completion owner: avoid those files concurrently or coordinate exact sections before writing; standards owner will preserve current import UI blocks.

## Endpoint needs / decisions

- Import backend contract (additive; existing JSON preview remains compatible):
  - `POST /api/imports/parse` accepts `{ sourceName, contentBase64 }`; admin-only, CSV/XLSX, decoded file <= 2 MiB, <= 500 data rows and <= 50 columns. Returns `{ sourceType, headers, rows }` and never persists domain data.
  - `POST /api/imports/preview` additionally accepts `sourceType` and `mapping` where mapping keys are canonical FARMER fields and values are source header names.
  - `GET /api/imports/:batchId` returns staged batch/rows; `GET /api/imports/:batchId/errors.csv` returns a spreadsheet-safe row-level quality report.
  - `POST /api/imports/:batchId/commit` accepts `{ reason }`, commits only a READY batch and is retry/idempotency safe.
  - `POST /api/imports/:batchId/void` accepts `{ reason }`; only an uncommitted PREVIEW/READY batch may be voided.
- Import UI is implemented against the contract above. Commit UI expects `{ batch, committedRows }` but tolerates either field being omitted; it requires `batch.status === "READY"` before enabling commit.
- UI decision: a batch containing any `ERROR` or `DUPLICATE` rows remains non-committable. Users download the error CSV, correct the source file, and preview again; no silent partial import.
- Stock endpoints are implemented as documented above. Backup export/merge includes append-only `stockMovements` and deduplicates restores by `movementId`.
- Google Sheets checks `(lotId, reference)` through the repository path but cannot provide a database-level atomic unique constraint. A later PostgreSQL/Supabase adapter must add `UNIQUE(lot_id, reference)`.
- Mapping templates are included in backup export/merge. Validation now verifies the raw archive checksum before applying additive defaults, so schema-v1 archives created before `importMappingTemplates` remain valid and restore that entity as an empty list.
- Allocation events are included in backup export/merge and deduplicated by `eventId`. The expiry endpoint is ADMIN-authenticated; operations integration must schedule it with the approved authenticated worker mechanism.

## Verification log

- Sprint 3 final integration: `npm run check` passed typecheck, 64/64 automated tests and production build on 2026-10-20. `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities; `git diff --check` and `node --check public/app.js` passed. The external worker endpoint is protected by a dedicated `CRON_SECRET`, processes due outbox messages and expired allocations, and records an audit event. Final desktop/mobile visual capture passed with a 390px document width and no overflow; an invalid-date UI fallback found during image inspection was fixed and recaptured.

- Sprint 3 Import completion: `npm run typecheck`, production build, `node --check public/app.js`, and `git diff --check` passed on 2026-10-20. Targeted Import Service + Mapping Template + HTTP API tests passed 34/34, including PLOT preview isolation, existing-farmer resolution, duplicate guards, commit/provenance, review transitions, and FARMER/PLOT templates. Impeccable desktop/mobile browser capture passed; mobile viewport stayed 390px with no overflow offenders. Review Queue includes loading, empty, error, filtering, double-submit guards, required reasons and provenance detail.

- Allocation lifecycle: targeted `tests/allocation-service.test.ts` + `tests/stock-service.test.ts` passed 8/8 on 2026-10-20. Reserve/release/ship/expire, replay idempotency, terminal guards, insufficient stock, reference conflicts and one-time expiry are covered. The transient `NEGATIVE_STOCK_BALANCE` failure was a test fixture that backdated RESERVE before RECEIVE; the fixture now records RECEIVE first and the production chronological balance invariant remains enforced. Integrated API and backup tests also passed in the preceding 60-test run; build/typecheck passed after the template-union test narrowing fix.

- Standards and impact: dedicated tests passed 2/2 and integrated tests passed 62/62. Final `node --check public/app.js`, production build, and visual check passed. Impact UI includes honest no-baseline, loading, error/retry and measured-at states. Lot UI now displays controlled standard state/history eligibility and submits definition/evidence/effective time/reason to the append-only API. Allocation UI lists responsible person, recipient, order reference, expiry, quantity and status, and provides working create/release/ship forms. Desktop/mobile captures passed; mobile document width remained 390px with no overflow offenders.

- Import templates: `npm run check` passed on 2026-10-20 (typecheck, 51/51 tests, production build). Coverage includes create/list/update APIs, required/unknown/duplicate header guards, duplicate template names, audit before/after snapshots, backup inclusion, and compatibility with older additive schema-v1 archives.

- Stock operations UI: `node --check public/app.js` and `node --check scripts/visual-check.mjs` passed. Browser verification exercised a RESERVE submission, confirmed the double-submit guard emitted exactly one POST with quantity 25, captured desktop/dialog/mobile states, and found mobile width 390px with no overflow. Loading, per-lot error/retry, empty history, recalled-lot, disabled and validation states are implemented. The first integrated build attempt was blocked only by concurrent import-provenance TypeScript edits (`src/app.ts:210`, `google-sheets-repository.ts:166`); stock-owned JavaScript passed and visual verification ran against the built server.

- Import provenance: `npm run typecheck` passed on 2026-10-20. `tests/import-service.test.ts` passed 7/7 including importer timestamps, pending/verified/rejected transitions, idempotent repeated decisions, before/after audit snapshots, filters and invalid-state guards. Combined `tests/import-service.test.ts tests/app.test.ts` passed 26/26 after integration with Import Templates.
- Import experience: `node --check public/app.js`, `npm run build`, and `git diff --check` passed on 2026-10-19. Browser/API integration remains pending until import backend endpoints land.
- Stock ledger: `tests/stock-service.test.ts` passed 4/4 (balances, idempotency, negative/unit guards, recall). An earlier integrated run passed 37/37. Final app/build rerun is pending concurrent import-backend TypeScript fixes; no stock-owned TypeScript error was reported.
- Import backend: TypeScript and build passed; `tests/import-service.test.ts` passed 5/5 (CSV/XLSX parsing, mapping/quality report, idempotent commit, void guard, malformed input); `npm audit --audit-level=moderate` reports 0 vulnerabilities after pinning patched `uuid`. Integrated suite passed 42/43; the sole failure was the concurrently-added stock HTTP test returning 409 instead of 201, handed to root/stock owner.
- Integration: corrected the stock HTTP fixture unit encoding, then `npm run check` passed typecheck, all 43 tests, and production build on 2026-10-19.
- Visual integration: desktop/mobile capture passed, mobile document width remained 390px with no overflow offenders, and Import empty/upload states follow the existing design system.
- Sprint 2 integration: root reran `npm run check` with 51/51 tests, production build, `npm audit --omit=dev --audit-level=high` with 0 vulnerabilities, and `git diff --check` successfully on 2026-10-20.
