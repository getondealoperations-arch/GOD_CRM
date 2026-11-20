# Meta permissions, webhook & token-management plan (SRS §5, §21.4)

## What the CRM does with Meta
1. **Lead Ads webhook** — Page `leadgen` events arrive at `/api/meta/webhook`, are signature-checked, fetched from the Graph API with campaign/ad set/ad/form IDs and names, de-duplicated (Meta lead ID, then mobile/email) and auto-assigned.
2. **Reliability** — every outcome is in the sync log; failures retry every minute (5 attempts), then stay visible as failed; an hourly **reconcile** pulls the last 48 h of leads from each selected form so a missed webhook never loses a lead.
3. **Ad spend** — Marketing API Insights at **ad level**, daily, every 6 hours (last 3 days re-synced, replacing earlier Meta rows so nothing double-counts). Gives CPL/CAC/ROAS/ROI per campaign, ad set and ad.

## Permissions (app review required for live use)
| Permission | Why |
|---|---|
| `leads_retrieval` | Read lead form submissions |
| `pages_manage_metadata` | Subscribe the Page to the `leadgen` webhook |
| `pages_show_list`, `pages_read_engagement` | List the admin's Pages and their lead forms |
| `ads_read` | Read ad spend (Insights) |
| `business_management` | Access Pages/ad accounts owned by the Business |

Until approved, only test leads (Lead Ads Testing Tool) and leads from people with a role on the app arrive.

## Setup (Settings → Meta, telephony & API)
1. Create a **Business** app at developers.facebook.com; add *Facebook Login for Business*, *Webhooks*, *Marketing API*.
2. Valid OAuth redirect URI: `https://<app>/api/meta/callback`. Webhooks → Page → `leadgen`, callback `https://<app>/api/meta/webhook`, verify token from Settings.
3. In the CRM enter App ID, App Secret, ad account ID → **Connect with Facebook** → pick the Page (the CRM subscribes it) → tick the lead forms to capture.
4. Test with the Lead Ads Testing Tool; the lead appears within seconds (acceptance criterion #1).

## Tokens
| Token | Source | Lifetime | Stored |
|---|---|---|---|
| Page token (reads leads) | From the long-lived user token at connect time | Does not expire unless the user's access is revoked/password changed | AES-256-GCM in `settings` |
| User token (ads_read) | OAuth code → long-lived exchange | ~60 days → reconnect, or replace with a **System User** token (recommended for production; non-expiring) | AES-256-GCM |
| App secret | Meta app settings | Until rotated | AES-256-GCM; also verifies webhook signatures |

**Monitoring:** "Check token & permissions" shows validity, expiry and granted scopes (debug_token). Expired tokens show up as failed syncs in the log and in `/api/health` → failures count. **Rotation:** paste a new token or reconnect; old values are overwritten, never displayed. Changing `APP_SECRET` invalidates stored secrets — re-enter them.
