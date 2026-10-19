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

## Contract changes

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
- Import mapping template contract: `ImportMappingTemplate { templateId, name, sourceName, entityType:"FARMER", headers:string[], mapping:Partial<Record<FarmerField,string>>, createdBy, updatedBy, createdAt, updatedAt }`.
- Template API: `GET /api/import-mapping-templates`; `POST /api/import-mapping-templates` accepts `{ name, sourceName, entityType:"FARMER", headers, mapping }`; `PATCH /api/import-mapping-templates/:templateId` accepts the same fields partially. Write routes are ADMIN-only; every mutation writes before/after audit.
- Template validation requires `memberCode` and `displayName`, rejects duplicate mapped source headers, and requires every mapped header to exist in `headers`. Google Sheets adds `ImportMappingTemplates` with headers `template_id,name,source_name,entity_type,headers,mapping,created_by,updated_by,created_at,updated_at`.

## Cross-agent notes

- Import backend should avoid editing dashboard files.
- Import UI should avoid changing backend/domain code; document missing endpoint needs below.
- Stock ledger should avoid editing dashboard files in this pass; expose backend contracts for later UI integration.
- Stock UI consumes the existing ledger endpoints without backend changes. Client references are created once when an operation opens and reused on retry, preserving API idempotency after a lost response.

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

## Verification log

- Import templates: `npm run check` passed on 2026-10-20 (typecheck, 51/51 tests, production build). Coverage includes create/list/update APIs, required/unknown/duplicate header guards, duplicate template names, audit before/after snapshots, backup inclusion, and compatibility with older additive schema-v1 archives.

- Stock operations UI: `node --check public/app.js` and `node --check scripts/visual-check.mjs` passed. Browser verification exercised a RESERVE submission, confirmed the double-submit guard emitted exactly one POST with quantity 25, captured desktop/dialog/mobile states, and found mobile width 390px with no overflow. Loading, per-lot error/retry, empty history, recalled-lot, disabled and validation states are implemented. The first integrated build attempt was blocked only by concurrent import-provenance TypeScript edits (`src/app.ts:210`, `google-sheets-repository.ts:166`); stock-owned JavaScript passed and visual verification ran against the built server.

- Import provenance: `npm run typecheck` passed on 2026-10-20. `tests/import-service.test.ts` passed 7/7 including importer timestamps, pending/verified/rejected transitions, idempotent repeated decisions, before/after audit snapshots, filters and invalid-state guards. Combined `tests/import-service.test.ts tests/app.test.ts` passed 26/26 after integration with Import Templates.
- Import experience: `node --check public/app.js`, `npm run build`, and `git diff --check` passed on 2026-10-19. Browser/API integration remains pending until import backend endpoints land.
- Stock ledger: `tests/stock-service.test.ts` passed 4/4 (balances, idempotency, negative/unit guards, recall). An earlier integrated run passed 37/37. Final app/build rerun is pending concurrent import-backend TypeScript fixes; no stock-owned TypeScript error was reported.
- Import backend: TypeScript and build passed; `tests/import-service.test.ts` passed 5/5 (CSV/XLSX parsing, mapping/quality report, idempotent commit, void guard, malformed input); `npm audit --audit-level=moderate` reports 0 vulnerabilities after pinning patched `uuid`. Integrated suite passed 42/43; the sole failure was the concurrently-added stock HTTP test returning 409 instead of 201, handed to root/stock owner.
- Integration: corrected the stock HTTP fixture unit encoding, then `npm run check` passed typecheck, all 43 tests, and production build on 2026-10-19.
- Visual integration: desktop/mobile capture passed, mobile document width remained 390px with no overflow offenders, and Import empty/upload states follow the existing design system.
- Sprint 2 integration: root reran `npm run check` with 51/51 tests, production build, `npm audit --omit=dev --audit-level=high` with 0 vulnerabilities, and `git diff --check` successfully on 2026-10-20.
