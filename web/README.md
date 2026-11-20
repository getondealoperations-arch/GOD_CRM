# GetOnDeal CRM — Lead to Sales & Calling Operations

Next.js 16 (App Router, server actions) + MySQL 8 / MariaDB. Built from `GetOnDeal_CRM_Software_Requirements.pdf` (SRS v1.0).

## Run it

```bash
cp .env.example .env.local      # set DATABASE_URL and APP_SECRET
npm install
npm run db:demo                 # create DB + schema + stages + admin + sample data   (npm run db:setup for an empty CRM)
npm run dev                     # http://localhost:3000
npm test                        # CPL / CAC / ROAS / ROI formula tests (acceptance #10)
```

Login: `admin@getondeal.local` / `Admin@123`. Demo users (password `Password@123`): `manager@`, `leader@`, `caller1@`–`caller3@`, `sales1@`, `sales2@`, `marketing@`, `viewer@getondeal.local`.

## What's where

| SRS section | Where |
|---|---|
| §3 Super Admin dashboard (all KPIs, 8 filters, forecast) | `/` |
| §4 Leads: search, filters, tags, bulk assign/transfer/status, saved views, timeline, change history, configurable priorities | `/leads`, `/leads/[id]`, Settings → General |
| §4 Duplicate detection (mobile / mobile-or-email / off) | `src/lib/leads.ts` `findDuplicate`, Settings |
| §5 Meta: Connect with Facebook (Page + form selection), webhook, signature check, reconcile, retry, ad-level spend sync, token & sync health | `/api/meta/*`, `src/lib/meta.ts`, Settings → Meta |
| §6 Import (.xlsx/.csv, mapping, validation, duplicate modes, failed rows, background job) / Export (CSV/Excel, filters, masking, logged, background for large) | `/leads/import`, `/api/import`, `/api/export`, `/jobs` |
| §7 Calling workspace, dispositions, Exotel click-to-call + recordings, call analytics | `/calling`, `src/lib/telephony.ts`, Reports → Call analytics |
| §8 Follow-ups (today/upcoming/overdue, outcomes, reassign, escalation, inactivity) | `/followups` |
| §9 Kanban, configurable stages **and transition rules**, stage history, time-in-stage, lost reasons, funnel/ageing | `/pipeline`, Settings → Pipeline |
| §10 8 roles, **editable permission matrix**, teams, hierarchy, targets, round-robin/rule assignment, caps, auto-redistribution from unavailable staff | `/team`, Settings |
| §11 Campaigns, spend (manual + Meta per ad), comparison | `/campaigns` |
| §12 Sales & payments (booked vs collected, statuses, refunds) | lead page, `/sales` |
| §13 CPL, conversion, CAC, ROAS, ROI on gross profit; first- or last-touch attribution | `src/lib/metrics.ts`, `src/lib/rules.ts` (+ tests) |
| §14 16 MIS reports with drill-down and CSV/Excel export | `/reports` |
| §15 Automation rules (each switchable), working hours, in-app + email/WhatsApp/SMS channels | `src/lib/automation.ts`, `src/lib/channels.ts`, Settings |
| §16 Responsive UI, dark mode, global search, saved views | everywhere |
| §17 RBAC, audit log, encrypted secrets, consent/DND/contact preference, anonymisation, retention, backups | `src/lib/auth.ts`, `/audit`, Settings → Backups, retention & scoring |
| §18 REST API, background jobs, error log, health endpoint, sync health, performance test | `/api/leads`, `/api/health`, `/jobs`, Settings → System health, `scripts/loadtest.mjs` |
| Phase 3 WhatsApp automation & inbound, lead scoring, predictive forecast, vertical-scoped users | `src/lib/channels.ts`, `src/lib/scoring.ts`, Reports → Forecast |

## Documentation (SRS §21 deliverables)

| Deliverable | File |
|---|---|
| Screen inventory (the running app is the clickable prototype) | [docs/SCREENS.md](docs/SCREENS.md) |
| Database schema / ER diagram | [docs/SCHEMA.md](docs/SCHEMA.md) |
| API documentation & integration contracts | [docs/API.md](docs/API.md) |
| Meta permissions, webhook & token plan | [docs/META.md](docs/META.md) |
| Telephony recommendation & scope | [docs/TELEPHONY.md](docs/TELEPHONY.md) |
| Role-permission matrix | [docs/ROLES.md](docs/ROLES.md) |
| Milestones, status & cost items | [docs/MILESTONES.md](docs/MILESTONES.md) |
| Test plan, UAT checklist, sign-off | [docs/UAT.md](docs/UAT.md) |
| Deployment, staging, backup/restore, DR, monitoring, handover | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Security, privacy & retention | [docs/PRIVACY.md](docs/PRIVACY.md) |
| Performance test results | [docs/PERFORMANCE.md](docs/PERFORMANCE.md) |

## Scripts

| Command | Does |
|---|---|
| `npm run db:setup` | Create or migrate the database (idempotent; run on every deploy) |
| `npm run db:demo` | Same + demo users and 400 sample leads |
| `npm run db:backup` / `npm run db:restore -- <file> --yes` | Backup / restore (gzipped mysqldump) |
| `npm test` | Formula, transition, attribution and scoring tests |
| `npm run perf:seed -- 100000` / `npm run perf:load -- <url> <email> <pw>` | Performance test (separate database only) |

## Rules worth knowing

- **Visibility:** executives see only their own leads; team leaders their team's; managers, marketing and viewers all — unless an admin changes the matrix. A user tied to a vertical sees only that category. Every query goes through `leadScope`.
- **Attribution:** every enquiry is recorded as a touch; each sale is credited once, to the first- or last-touch campaign (Settings → General).
- **ROI:** (gross profit − spend) ÷ spend. ROAS = revenue ÷ spend. Spend is per campaign, and per ad set/ad when synced from Meta.
- **Date ranges:** leads are counted by creation date; calls, sales, payments and spend by their own dates.
- **Integrations are off until configured:** Meta, Exotel, WhatsApp, SMTP and SMS each do nothing until their credentials are entered; without telephony the call button uses the phone dialer.

## Needs outside accounts / people (not code)

- Meta app review, Exotel account + KYC, WhatsApp Business number and approved templates, SMS DLT registration.
- Legal review against the DPDP Act and TRAI telemarketing rules (SRS §17).
- Real hosting, off-site backup storage and an uptime monitor — see docs/DEPLOYMENT.md.
