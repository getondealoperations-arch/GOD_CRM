# Screen inventory (SRS §16, §21.1)

The running app is the clickable prototype (`npm run db:demo && npm run dev`, log in as any demo user). Screens:

| Screen | URL | Who | Purpose |
|---|---|---|---|
| Login | `/login` | All | Email + password |
| Employee login | `/employee/login` | Calling/sales executives, team leaders | Separate sign-in for field staff; managers and admins are sent to `/login`. Lands on My work |
| My work | `/work` | Everyone who works leads | Today's targets (calls, follow-ups, conversions), next calls in queue order, follow-ups due, newly assigned leads. Calling and sales executives land here instead of the Dashboard and get a slim sidebar |
| Split and assign | `/leads/distribute` | Assign perm | Pick a pool of unassigned leads (campaign, source, category, city), pick available employees, preview the equal split, apply. Best-scored leads are dealt first; one summary notification per employee; audited as `split_assign` |
| Dashboard | `/` | All | All §3 KPIs incl. predicted conversions & forecast revenue; 8 filters; leads/day chart; stage funnel; drill-down |
| Leads | `/leads` | All (scoped) | Search, filters, saved views, sort (incl. score), bulk assign/stage/priority/tag/delete, export, reactivation queue |
| New lead | `/leads/new` | Create perm | Manual entry, duplicate check, consent & contact preference |
| Lead detail | `/leads/[id]` | Scoped | Fields, score, sales & payments, call history + recordings, marketing touches, stage history, timeline, call panel, WhatsApp, follow-ups, anonymise |
| Import | `/leads/import` | Import perm | Upload → map → preview → validate → background import with progress |
| Pipeline | `/pipeline` | All (scoped) | Kanban drag & drop, stage totals, time in stage, transition rules enforced |
| Calling workspace | `/calling` | Callers, leaders | Score-ordered queue, today's stats, click-to-call, one-tap dispositions, follow-up presets |
| Follow-ups | `/followups` | All | Today / upcoming / overdue, outcomes, reassign |
| Campaigns | `/campaigns`, `/campaigns/[id]` | Reports perm | Campaign comparison, spend entries, ad set/ad breakdown |
| Sales & payments | `/sales` | All (scoped) | Booked vs collected, statuses |
| Reports & MIS | `/reports` | Reports perm | 16 reports incl. call analytics & forecast; filters, drill-down, CSV/Excel |
| Team | `/team` | Reports perm | Employee performance vs targets, users, teams, phone/vertical/channels, reassign open leads |
| Background jobs | `/jobs` | All (own) | Import/export progress and downloads |
| Audit log | `/audit` | Audit perm | Every key action |
| Notifications | `/notifications` | All | In-app inbox, availability, my channels, password |
| Settings (8 tabs) | `/settings?tab=…` | Settings perm | General & automation rules; pipeline & transitions; distribution; roles & permissions; Meta/telephony/API; notifications & WhatsApp; backups/retention/scoring; system health |

All screens are responsive (desktop + phone) and support light/dark mode.
