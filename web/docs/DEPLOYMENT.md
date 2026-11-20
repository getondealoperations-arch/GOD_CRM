# Deployment, backup, monitoring & handover (SRS §17, §18, §21.9–10)

## Requirements
Node.js 20.9+ (22 LTS recommended), MySQL 8 or MariaDB 10.6+, `mysqldump`/`mysql` on the app server (for backups), HTTPS in front of the app.

## Environments
| | Production | Staging |
|---|---|---|
| Database | `getondeal_crm` | `getondeal_staging` (separate server or schema) |
| URL | `https://crm.getondeal.com` | `https://staging-crm.getondeal.com` |
| Env file | `.env.production` | `.env.staging` (copy `.env.staging.example`) |
| Integrations | Live Meta app, Exotel, WhatsApp | Meta **test** app/Page, Exotel sandbox or off, WhatsApp test number |

Promote by deploying the same git commit to staging, running the UAT checklist ([UAT.md](UAT.md)), then production. Never copy production data to staging without anonymising it.

## Deploy (single server, e.g. AWS Lightsail/EC2, DigitalOcean)
```bash
git clone <company repo> crm && cd crm/web
cp .env.example .env.production   # set DATABASE_URL, APP_SECRET (32+ random chars), APP_URL, BACKUP_DIR, STORAGE_DIR
npm ci
npm run db:setup                  # creates/migrates schema; safe on every deploy
npm run build
NODE_ENV=production node --env-file=.env.production node_modules/.bin/next start -p 3000
```
Run it under a process manager (systemd or PM2) with restart-on-failure, behind Nginx/Caddy for TLS. The session cookie is `Secure` in production, so HTTPS is mandatory.

**Updates:** `git pull && npm ci && npm run db:setup && npm run build && restart`. Migrations are additive and idempotent.

**Several app instances:** set `AUTOMATION=off` on all of them and have one scheduler `POST /api/cron` every minute with `Authorization: Bearer $CRON_SECRET`. Put `STORAGE_DIR` on shared storage (EFS/NFS) so any instance can serve job downloads.

## Backups & restore
- **Automatic:** Settings → Backups → enable daily backup (time + days to keep). Writes `BACKUP_DIR/getondeal-<UTC stamp>.sql.gz` with `mysqldump --single-transaction` (no locking).
- **Manual / cron:** `npm run db:backup`.
- **Off-site (required for DR):** sync `BACKUP_DIR` to S3/another region daily, e.g. `aws s3 sync /var/backups/crm s3://getondeal-backups/crm --storage-class STANDARD_IA`. Managed databases (RDS, Cloud SQL) should also keep their own point-in-time recovery.
- **Restore:** stop the app, then `npm run db:restore -- /path/getondeal-….sql.gz --yes`, then `npm run db:setup`, then start the app. Test a restore into a scratch database monthly (`DATABASE_URL=…/getondeal_restore_test`).

## Disaster recovery plan
| Scenario | Action | Target |
|---|---|---|
| App server lost | New server → deploy steps above → point DNS | RTO ≈ 1 h |
| Database corrupted / bad import | Restore latest backup (or PITR on managed DB) | RPO ≤ 24 h with daily dumps; minutes with PITR |
| Region outage | Restore off-site backup in another region, redeploy | RTO ≈ 4 h |
| Leaked `APP_SECRET` | Rotate it (logs everyone out), re-enter Meta/WhatsApp/Exotel/SMTP secrets, rotate API key | Same day |
| Meta outage / expired token | Leads queue as failed in the sync log; fix token → "Retry failed" + "Reconcile" (48 h lookback) | No data loss |

## Monitoring
- Uptime monitor (UptimeRobot, Better Stack, Pingdom) on `GET /api/health` every 1–5 min; alert on non-200. It reports DB status, automation heartbeat, job queue, unrecoverable Meta failures and errors in the last hour.
- **Settings → System health:** automation status, error log (all server errors via `instrumentation.ts`), jobs, failed messages, DB size.
- **Settings → Meta:** sync health (7-day success/failed/duplicate/ignored) and per-lead log.
- Application logs: stdout/stderr of the Node process (journald / PM2 logs).

## Handover checklist
- [ ] Code in a company-owned Git repository (GitHub/GitLab org); company owns the Meta app, Exotel and WhatsApp accounts, domain and cloud account
- [ ] Production and staging `.env` stored in the company's password manager
- [ ] Super Admin password changed from the default; named admin accounts created
- [ ] Backups enabled, off-site sync running, one test restore done
- [ ] Uptime monitor on `/api/health` alerting the right people
- [ ] Meta app review approved; token check green; test lead received
- [ ] UAT checklist signed off ([UAT.md](UAT.md))
- [ ] Docs handed over: this file, [API.md](API.md), [SCHEMA.md](SCHEMA.md), [ROLES.md](ROLES.md), [META.md](META.md), [TELEPHONY.md](TELEPHONY.md), [PRIVACY.md](PRIVACY.md)
