# API & integration contracts (SRS §18, §21.3)

Base URL: your deployment, e.g. `https://crm.getondeal.com`. All bodies are JSON unless noted. Times are server local time, `YYYY-MM-DD HH:MM:SS`.

## Authentication

| Caller | How |
|---|---|
| Third-party systems (website forms, other tools) | Header `x-api-key: <key>` — key in Settings → Meta, telephony & API. Regenerating it invalidates the old key immediately. |
| Logged-in users (browser) | Session cookie `god_session` (HTTP-only, signed, 12 h). |
| Meta / WhatsApp webhooks | `x-hub-signature-256` HMAC-SHA256 of the raw body with the Meta App Secret. |
| Telephony callback | `?token=` shared secret generated at setup (Settings shows the URL). |
| Scheduler | `Authorization: Bearer $CRON_SECRET`. |

## Leads

### `POST /api/leads` — create a lead

```json
{ "name": "Riya Shah", "mobile": "+91 98200 12345", "email": "riya@example.com",
  "alt_mobile": "", "business_name": "Shah Traders", "category": "Retail", "city": "Pune",
  "source": "Website", "channel": "Other", "campaign_name": "Diwali Offer – Lead Form",
  "adset_name": "", "ad_name": "", "form_name": "Contact us", "priority": "high",
  "remarks": "Wants a demo", "tags": "website,demo" }
```

`name` and `mobile` are required. Mobile numbers are normalised (Indian `+91`/`0` prefixes removed). `campaign_name` is linked to an existing campaign with the same name. The lead is auto-assigned by the distribution rules.

| Status | Body | Meaning |
|---|---|---|
| 201 | `{"id": 701, "lead_code": "GOD-000701"}` | Created |
| 409 | `{"duplicate": true, "id": 701, "lead_code": "GOD-000701"}` | Matches an existing lead (duplicate rule in Settings). The enquiry is recorded as a marketing touch on that lead for attribution. |
| 422 | `{"error": "name and a valid mobile are required"}` | Validation failed |
| 401 / 403 | `{"error": "Unauthorized"}` | Bad key / no permission |

### `GET /api/leads` — list leads

Query: `q` (name, mobile, business, Lead ID, campaign), `source`, `campaign` (id), `category`, `city`, `stage` (id), `owner` (id or `none`), `team`, `priority`, `conversion` (`open`/`converted`/`lost`), `from`, `to` (creation date), `page` (1…), `limit` (≤ 500, default 100).

Response: `{"page": 1, "limit": 100, "data": [ {lead…, "stage": "Interested"} ]}`. With an API key the caller sees all leads; with a session, only what that user may see.

## Operations

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Monitoring probe. `200 {"status":"ok"}` or `503 {"status":"degraded"}` (database down, or automation not run for 5 min). No personal data. |
| `POST /api/cron` | Runs one automation cycle. Use when `AUTOMATION=off` (several app instances); call every minute from one scheduler. |
| `POST /api/import` (session) | multipart `file` (.csv/.xlsx), `mode` = `preview` / `validate` / `import`, `mapping` JSON `{ "File column": "crm_field" }`, `duplicates` = `skip` / `update` / `allow`. `import` returns `{"jobId": n}`. |
| `GET /api/jobs/:id` (session) | Job status `{status, progress, total, result}`. |
| `GET /api/jobs/:id/download`, `/failed` | Export file; failed import rows with reasons (CSV). |
| `GET /api/export?format=csv\|xlsx&…filters` (session) | Lead export (same filters as the list). Over 20 000 rows, or with `background=1`, it runs as a job and redirects to `/jobs`. `report=<name>` exports a report. Every export is audit-logged. |

## Inbound webhooks

| Endpoint | Sender | Contract |
|---|---|---|
| `GET/POST /api/meta/webhook` | Meta Lead Ads (Page → `leadgen`) | GET verifies `hub.verify_token`. POST must be signed; each `leadgen_id` is fetched from the Graph API, de-duplicated and stored. Every outcome is written to the sync log; failures are retried (5 attempts) and missed leads are reconciled hourly. |
| `GET/POST /api/whatsapp/webhook` | WhatsApp Cloud API (`messages`) | Same verification/signature. Inbound messages go to the lead timeline (unknown numbers create a WhatsApp lead); delivery statuses update the message log. |
| `GET/POST /api/telephony/callback?token=` | Exotel status callback | Fields used: `CallSid`, `Status`, `ConversationDuration`/`DialCallDuration`, `RecordingUrl`, `StartTime`, `EndTime` (form-encoded or JSON). |
| `GET /api/meta/connect`, `/api/meta/callback` | Admin browser | "Connect with Facebook" OAuth. CSRF-protected with a state cookie. |

## Outbound calls the CRM makes

| To | When |
|---|---|
| `graph.facebook.com/{v}/{leadgen_id}` | Each Lead Ads webhook, retries, reconcile |
| `graph.facebook.com/{v}/act_{id}/insights?level=ad` | Ad spend sync (every 6 h, or on demand) |
| `graph.facebook.com/{v}/{phone_id}/messages` | WhatsApp messages |
| `https://{api host}/v1/Accounts/{sid}/Calls/connect.json` | Exotel click-to-call |
| SMTP server / SMS gateway URL | Notifications (if configured) |
