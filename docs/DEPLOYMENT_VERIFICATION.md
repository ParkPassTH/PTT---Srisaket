# Deployment Verification Checklist

Record the deployed commit, environment and evidence for every release. Never paste secret values here.

## Build and configuration

- [ ] Deployed commit equals the commit that passed CI
- [ ] `npm ci`, `npm run check`, and production dependency audit pass
- [ ] `NODE_ENV=production`, `APP_BASE_URL`, `ALLOWED_ORIGINS` match the public domain
- [ ] `DATA_DRIVER=google-sheets`; Sheets service account has access
- [ ] LINE and selected AI provider variables are configured
- [ ] `SESSION_SECRET`, admin password and `CRON_SECRET` are unique production values

## Smoke tests

- [ ] `GET /health` returns 200
- [ ] `GET /ready` returns ready; missing dependencies are investigated
- [ ] Login and dashboard load without mock records
- [ ] Signed LINE webhook records one event; duplicate delivery creates no duplicate
- [ ] Thai audio produces transcript or an actionable retry/review state
- [ ] Import Preview does not mutate registry; commit/replay remains idempotent
- [ ] Review decision writes actor, time, reason and audit
- [ ] Harvest activity creates one lot and one RECEIVE
- [ ] Reserve/release/ship reconcile with on-hand/reserved/available
- [ ] Public trace omits farmer PII
- [ ] Backup export checksum validates; restore drill is recorded outside production

## Operational acceptance

- [ ] External uptime checks for `/health` and `/ready` are active
- [ ] Scheduled worker calls `GET /api/system/workers/process` with Bearer `CRON_SECRET` and processes outbox/allocation expiry
- [ ] Gemini/Google/Vercel quota and cost alerts have named recipients
- [ ] Incident owner, escalation channel, rollback commit and last backup are known
- [ ] Approved ICS definitions and effective dates are loaded; otherwise standard-dependent allocation stays unavailable

## Release record

| Field | Value |
|---|---|
| Commit | |
| Environment/domain | |
| Verified by / time | |
| CI run | |
| Backup checksum | |
| Known limitations | |
| Rollback target | |
