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

## Contract changes

- Existing preview endpoint: `POST /api/imports/preview` accepts `{ sourceName, rows }` for FARMER staging.
- Import UI may be developed against the existing endpoint; backend owner must record any replacement request/response shape here.
- Stock ledger must remain repository-agnostic and preserve audit before/after snapshots.
- Stock contract: `StockMovement { movementId, lotId, movementType, quantity, unit, actorId, reason, reference, occurredAt }`; types are `RECEIVE|RESERVE|RELEASE|SHIP|ADJUST|RECALL`. `(lotId, reference)` is the idempotency key.
- Stock balance response: `{ lotId, unit, onHand, reserved, available, recalled, updatedAt? }`. `SHIP` consumes reserved stock first; `RECALL` makes available zero without erasing physical on-hand.
- Proposed API: `GET /api/lots/:lotId/stock` returns `{ balance, movements }`; `POST /api/lots/:lotId/stock-movements` accepts `{ type, quantity, unit, reason, reference }` and returns `{ movement, balance, created }` (201 new, 200 idempotent replay).
- Lot creation must call idempotent RECEIVE using reference `lot-create:<activityId>` after persisting/linking the lot, and include `balance` in the 201 response.

## Cross-agent notes

- Import backend should avoid editing dashboard files.
- Import UI should avoid changing backend/domain code; document missing endpoint needs below.
- Stock ledger should avoid editing dashboard files in this pass; expose backend contracts for later UI integration.

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

## Verification log

- Import experience: `node --check public/app.js`, `npm run build`, and `git diff --check` passed on 2026-10-19. Browser/API integration remains pending until import backend endpoints land.
- Stock ledger: `tests/stock-service.test.ts` passed 4/4 (balances, idempotency, negative/unit guards, recall). An earlier integrated run passed 37/37. Final app/build rerun is pending concurrent import-backend TypeScript fixes; no stock-owned TypeScript error was reported.
- Import backend: TypeScript and build passed; `tests/import-service.test.ts` passed 5/5 (CSV/XLSX parsing, mapping/quality report, idempotent commit, void guard, malformed input); `npm audit --audit-level=moderate` reports 0 vulnerabilities after pinning patched `uuid`. Integrated suite passed 42/43; the sole failure was the concurrently-added stock HTTP test returning 409 instead of 201, handed to root/stock owner.
- Integration: corrected the stock HTTP fixture unit encoding, then `npm run check` passed typecheck, all 43 tests, and production build on 2026-10-19.
- Visual integration: desktop/mobile capture passed, mobile document width remained 390px with no overflow offenders, and Import empty/upload states follow the existing design system.
