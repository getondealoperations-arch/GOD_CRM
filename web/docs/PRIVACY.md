# Security, privacy & data retention (SRS §17)

> Engineering controls only. The SRS requires a legal review against the **Digital Personal Data Protection Act 2023** and **TRAI TCCCPR** (telemarketing) rules — have counsel review this before go-live.

## Security controls
| Control | Implementation |
|---|---|
| Authentication | scrypt password hashes, HMAC-signed HTTP-only session cookie (12 h, `Secure` in production) |
| Authorisation | Role-permission matrix (configurable), record-level scoping (own / team / all / vertical) on every lead query; 403 page for disallowed screens |
| Secrets | Meta, WhatsApp, Exotel and SMTP credentials encrypted with AES-256-GCM (key derived from `APP_SECRET`); never shown back in the UI |
| Webhooks | Meta/WhatsApp HMAC signature check; telephony callback token; constant-time comparisons |
| Audit | Lead create/edit (old→new values), assign, stage change, export (with filters & row count), import, delete (with snapshot), anonymise, settings, permission and backup actions → Audit Log |
| Bulk export & delete | Permission-gated; exports can be masked; large exports run as jobs visible only to their creator and admins |
| Backups | Super-Admin-only download, every download audited |

## Consent & communication preferences
- Each lead stores **consent** (with timestamp and how it was recorded), **DND**, and **preferred channels** (call / WhatsApp / SMS / email).
- DND leads are excluded from the calling queue; the call panel warns on DND and outside 9 am–9 pm.
- WhatsApp messages (manual or automated) are only sent when consent is on, DND is off and the preference allows WhatsApp.

## Retention policy (Settings → Backups, retention & scoring)
| Data | Default | Notes |
|---|---|---|
| Read notifications | 90 days | |
| Meta sync logs (non-failed), error logs, message logs | 180 days | Failed Meta syncs are kept until resolved |
| Finished background jobs + their files | 30 days; uploads 7 days | |
| Lost leads | Keep (0 = never) | Set N months to auto-**anonymise** Lost leads older than N months |
| Audit logs, sales, payments | Kept | Accountability and financial records |
| Backups | 14 days on server | Plus your off-site retention |

**Anonymise** (lead page, or automatic) erases name, phone, email, business name, remarks, tags, notes, call remarks/recordings and message bodies, but keeps the anonymous record so reports stay accurate. Use it for erasure requests; **Delete** removes the lead entirely.
