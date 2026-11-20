# Milestones, status & cost items (SRS §19, §21.7)

## Status by phase
| Phase | Scope (SRS §19) | Status |
|---|---|---|
| **1 — Core CRM** | Dashboard & role login; manual lead creation; import/export; source tracking & duplicates; Meta Lead Ads & assignment; calling workspace, dispositions, follow-ups; pipeline; employee management; conversion & productivity reports | ✅ Built |
| **2 — Performance & ROI** | Campaigns & Meta ad spend (per ad); CPL/CAC/ROAS/ROI dashboards; revenue/payments; automated distribution, reminders, escalations; advanced MIS & employee reports | ✅ Built |
| **3 — Advanced automation** | Cloud telephony (Exotel) with recordings & call analytics; WhatsApp Cloud API automation + inbound; email/SMS channels; lead scoring & prioritised queue; predictive conversion forecast; vertical-scoped users | ✅ Built — needs provider accounts to go live |

## Go-live milestones (remaining work is configuration, not code)
| # | Milestone | Owner | Depends on |
|---|---|---|---|
| 1 | Staging deployed with demo data; internal walkthrough | Developer | Cloud account, domain |
| 2 | Meta app created, connected on staging, app review submitted | Marketing + developer | Business verification |
| 3 | Exotel account, ExoPhone, KYC; WhatsApp Business number + templates approved | Ops | Vendor onboarding |
| 4 | UAT on staging ([UAT.md](UAT.md)), fixes | Business users | 1–3 |
| 5 | Legal review (DPDP, TRAI), consent text on lead forms | Legal | — |
| 6 | Production deploy, backups off-site, monitoring, data migration (import existing leads) | Developer | 4, 5 |
| 7 | Training (callers, managers, admins) and go-live | Business owner | 6 |

## Running-cost line items to quote
Exact prices change and depend on volume, so obtain current quotes:
- App hosting (1 small VM is enough for the tested load) and a managed MySQL instance with backups
- Off-site backup storage (S3 or similar)
- Exotel: plan + per-minute charges + ExoPhone rental + recording storage
- WhatsApp Business: Meta's per-conversation/template charges (directly or via a BSP)
- SMS gateway (DLT registration) and SMTP/email service
- Domain + TLS (free with Let's Encrypt), uptime monitoring (free tiers available)
