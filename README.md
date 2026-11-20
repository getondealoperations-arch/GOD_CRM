# GetOnDeal CRM — Lead to Sales & Calling OperationS

A complete lead-to-sales CRM for GetOnDeal: lead capture (Meta Lead Ads, import, API, manual), calling workspace, follow-ups, sales pipeline, team management, campaigns, revenue & payments, marketing ROI and MIS reports — built from the [Software Requirement Specification](GetOnDeal_CRM_Software_Requirements.pdf).

**Stack:** Next.js 16 (App Router, server actions) · React 19 · Tailwind CSS 4 · MySQL 8 / MariaDB · TypeScript

## Features

| Area | Highlights |
|---|---|
| Dashboard | All KPIs (leads, calls, follow-ups, conversions, revenue, spend, CPL, CAC, ROAS, ROI), 8 filters, conversion forecast |
| Leads | Manual entry, Excel/CSV import with mapping & validation, filtered export, search, tags, bulk actions, saved views, duplicate rules, full timeline & change history |
| Meta Ads | Connect with Facebook, Page & form selection, Lead Ads webhook, retry + hourly reconcile, ad-level spend sync, sync health |
| Calling | Score-ordered calling queue, one-tap dispositions, follow-up presets, Exotel click-to-call with recordings, call analytics |
| Follow-ups & pipeline | Today / upcoming / overdue, reminders, escalation; Kanban with configurable stages and transition rules |
| Team | 8 roles, editable permission matrix, teams & hierarchy, targets, round-robin / rule-based assignment, daily caps, auto-redistribution |
| Sales & ROI | Sales, payments, refunds, booked vs collected; first- or last-touch attribution; ROI on gross profit |
| Reports | 16 MIS reports with drill-down and CSV/Excel export |
| Automation | SLA alerts, reminders, escalations, reactivation queue, lead scoring — runs every minute; in-app, email, WhatsApp and SMS notifications |
| Security & ops | RBAC, audit log, encrypted credentials, consent/DND, anonymisation, retention policy, Backups & restore, background jobs, health endpoint, light/dark mode |

## Quick start

Requirements: Node.js 20.9+ and MySQL 8 or MariaDB 10.6+.

```bash
cd web
cp .env.example .env.local      # set DATABASE_URL and APP_SECRET
npm install
npm run db:demo                 # create the database with demo users and sample leads
npm run dev                     # http://localhost:3000
```

Demo login: `admin@getondeal.local` / `Admin@123` (demo data only — never use demo data or passwords in production).

```bash
npm test          # formula & business-rule tests
npm run build     # production build
```

## Repository layout

```
GetOnDeal_CRM_Software_Requirements.pdf   the SRS this project implements
web/                                      the Next.js application
  src/app/          pages, API routes and server actions
  src/lib/          business logic (leads, auth, Meta, telephony, channels, reports, automation, scoring)
  db/schema.sql     database schema
  scripts/          database setup/migration, backup, restore, performance test
  docs/             technical documentation
```

## Documentation

| Topic | File |
|---|---|
| Feature map by SRS section, scripts, rules | [web/README.md](web/README.md) |
| Deployment, staging, backups, disaster recovery, monitoring, handover | [web/docs/DEPLOYMENT.md](web/docs/DEPLOYMENT.md) |
| REST API & webhooks | [web/docs/API.md](web/docs/API.md) |
| Database schema & ER diagram | [web/docs/SCHEMA.md](web/docs/SCHEMA.md) |
| Role-permission matrix | [web/docs/ROLES.md](web/docs/ROLES.md) |
| Meta app, permissions & tokens | [web/docs/META.md](web/docs/META.md) |
| Telephony (Exotel) | [web/docs/TELEPHONY.md](web/docs/TELEPHONY.md) |
| Security, privacy & data retention | [web/docs/PRIVACY.md](web/docs/PRIVACY.md) |
| Test plan, UAT checklist & sign-off | [web/docs/UAT.md](web/docs/UAT.md) |
| Performance test results | [web/docs/PERFORMANCE.md](web/docs/PERFORMANCE.md) |
| Milestones & go-live plan | [web/docs/MILESTONES.md](web/docs/MILESTONES.md) |
| Screen inventory | [web/docs/SCREENS.md](web/docs/SCREENS.md) |

## Going live

The code is complete. Going live needs accounts and configuration rather than more code: a server with HTTPS, a MySQL database with off-site backups, Meta app review, Exotel and WhatsApp Business accounts (optional), a legal review (DPDP Act, TRAI), and user acceptance testing. Every integration stays switched off until its credentials are entered in **Settings**. See [web/docs/DEPLOYMENT.md](web/docs/DEPLOYMENT.md) and [web/docs/MILESTONES.md](web/docs/MILESTONES.md).

## Configuration

Copy `web/.env.example`. Never commit `.env*` files with real values — `APP_SECRET` signs sessions and encrypts stored integration credentials.
