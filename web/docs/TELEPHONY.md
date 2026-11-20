# Telephony recommendation & integration scope (SRS §7, §21.5)

Ordinary mobile calls give the CRM no reliable call log or recording. For click-to-call, automatic duration, recordings and agent call reports, use a cloud telephony provider.

## Recommendation: Exotel (built-in)
| Provider | Fit | Notes |
|---|---|---|
| **Exotel** (integrated) | Best fit for an Indian inside-sales team | Click-to-call "connect" API (agent's mobile rings first, then the customer), call recording, status callbacks, ExoPhone virtual numbers, DLT-compliant. No softphone needed — agents keep using their phones. |
| Ozonetel / Knowlarity / MyOperator | Good alternatives | Same pattern (connect API + callback). Adding one = a `startCall` + callback parser in `src/lib/telephony.ts`. |
| Twilio | Global, more expensive in India | Better if calls are international. |

Get current per-minute and number rental pricing directly from the vendors; prices change and depend on volume.

## What is built
- Settings → Meta, telephony & API → **Exotel**: SID, API key/token (encrypted), API host, caller ID.
- Agents' phone numbers on the Team page.
- Calling workspace / lead page **Call** button → Exotel connect API with recording on → call row created.
- Exotel status callback (`/api/telephony/callback?token=…`) stores status, talk time, start/end and recording URL; if the agent hasn't saved an outcome, one is derived (completed → Connected, busy → Busy, no-answer → Not Answered) so no call goes unlogged.
- Recordings play on the lead page; **Call analytics** report by agent / hour / outcome (connect %, talk time, recorded calls).
- Without a provider the app falls back to `tel:` links and manual logging.

## Compliance
- Disclose recording to customers; store recordings only as long as needed (retention settings).
- Respect DND/NCPR and TRAI calling hours (the call panel warns outside 9 am–9 pm; DND leads are excluded from the calling queue).
