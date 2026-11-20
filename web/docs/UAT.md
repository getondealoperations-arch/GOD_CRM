# Test plan, UAT checklist & acceptance sign-off (SRS §20, §21.8)

## Test plan
| Level | What | How |
|---|---|---|
| Unit | CPL, conversion, CAC, ROAS, ROI formulas; stage transition rules; first/last-touch attribution; win probability & score | `npm test` (`src/lib/*.test.ts`) |
| Static | Type safety, lint, production build | `npx tsc --noEmit`, `npm run lint`, `npm run build` |
| Integration (manual/scripted) | Import, API, webhooks, telephony callback, jobs, backups, permissions — see checklist | Staging with demo data (`npm run db:demo`) |
| Performance | 100 k leads, 20 concurrent users | [PERFORMANCE.md](PERFORMANCE.md) |
| UAT | Business users run the checklist below on staging with real-like data | Sign-off table at the end |

Test accounts (demo data): `admin@getondeal.local` / `Admin@123`; `manager@`, `leader@`, `caller1@`–`caller3@`, `sales1@`, `sales2@`, `marketing@`, `viewer@getondeal.local` / `Password@123`.

## UAT checklist — SRS §20 acceptance criteria
| # | Criterion | Steps | Expected | Pass |
|---|---|---|---|---|
| 1 | Meta Lead Ad appears automatically with metadata | Connect the Page (Settings → Meta). Submit via Meta's Lead Ads Testing Tool. | Lead appears in Leads within seconds, source *Meta Lead Ads*, campaign / ad set / ad / form filled, auto-assigned, sync log shows *success* | ☐ |
| 2 | Import ≥ 1,000 leads with validation & report | Leads → Import → template with 1,000+ rows incl. a few bad rows → map → Validate → Import | Progress bar; summary of new / updated / skipped / failed; failed rows downloadable with reasons; job listed under Background Jobs | ☐ |
| 3 | Manual lead + filtered export | + New lead; then filter Leads (e.g. source + date) → Export Excel | Lead created with Lead ID; file contains only filtered rows; export appears in Audit Log | ☐ |
| 4 | Duplicate detection per rules | Create a lead with an existing mobile; switch rule to *Mobile only* / *Off* in Settings | Duplicate blocked with link to the existing lead; behaviour follows the rule | ☐ |
| 5 | Assignment & visibility | Assign leads (bulk); log in as caller1 | caller1 sees only own leads; opening another lead's URL gives "not found"; export/settings give 403 | ☐ |
| 6 | Calls, dispositions, remarks, follow-ups | Calling Workspace → Call → pick disposition → follow-up preset → Save | Call in history, stage advanced, follow-up scheduled, next lead opens | ☐ |
| 7 | Manager sees team calling & follow-up performance | Log in as manager → Team; Reports → Employee / Call analytics / Follow-ups | Per-person calls vs target, talk time, follow-ups done/overdue | ☐ |
| 8 | Stage changes & key actions audited | Move a lead on the Kanban; edit a field; export | Stage history with user/time; Audit Log entries | ☐ |
| 9 | Converted lead → sale & payment | Lead page → Record a sale with partial payment → add rest | Lead Converted/Won; sale Partially Paid → Paid; dashboard revenue updates | ☐ |
| 10 | CPL, conversion, CAC, ROAS, ROI correct | `npm test`; compare one campaign by hand on Campaigns | Tests pass; numbers match the formulas in SRS §13 | ☐ |
| 11 | Reports filtered & exported | Reports & MIS → any report → filter → Export CSV / Excel | File matches the on-screen rows | ☐ |
| 12 | Meta sync failures visible & recoverable | Set a wrong token, send a test lead; fix token → Retry failed / Reconcile | Failure visible in sync log & System health; lead imported after fix, no duplicate | ☐ |

## Additional checks (features beyond §20)
| Area | Check | Pass |
|---|---|---|
| Transition rules | Restrict *New Lead → Assigned, Lost*; try moving to Negotiation | ☐ |
| Configurable priorities / permissions | Change the priority list; remove *Export* from Sales Manager | ☐ |
| Unavailable reassignment | Mark a caller unavailable; their uncontacted leads move within a minute | ☐ |
| Telephony | Exotel click-to-call rings agent then customer; recording plays on lead page | ☐ |
| WhatsApp | Welcome template on new consented lead; customer reply lands on timeline | ☐ |
| Notifications | Email/WhatsApp/SMS test from Settings; user channel preferences honoured | ☐ |
| Scoring | Calling queue ordered by score; dashboard forecast shown | ☐ |
| Backups | Back up now; restore into a scratch DB | ☐ |
| Retention / anonymise | Anonymise a lead; personal fields and notes erased, counts unchanged | ☐ |
| Mobile | Calling Workspace and lead page usable on a phone | ☐ |
| Dark mode | Toggle 🌙/☀️; all pages readable | ☐ |

## Sign-off
| Role | Name | Date | Signature | Result (Accepted / Accepted with notes / Rejected) |
|---|---|---|---|---|
| Business owner | | | | |
| Sales manager | | | | |
| Marketing manager | | | | |
| Technical reviewer | | | | |

Open issues found during UAT:

| # | Description | Severity | Owner | Status |
|---|---|---|---|---|
| | | | | |
