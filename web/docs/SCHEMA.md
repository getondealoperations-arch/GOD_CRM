# Database schema & ER diagram (SRS §21.2)

Source of truth: [`db/schema.sql`](../db/schema.sql). `npm run db:setup` creates it and migrates older databases in place (safe to re-run).
MySQL 8 or MariaDB 10.6+, InnoDB, utf8mb4.

```mermaid
erDiagram
  teams ||--o{ users : "has members"
  users ||--o{ users : "reports to (manager_id)"
  users ||--o{ leads : owns
  stages ||--o{ leads : "current stage"
  campaigns ||--o{ leads : "generated"
  campaigns ||--o{ spend_entries : "spend (per day, ad set, ad)"
  leads ||--o{ lead_touches : "marketing touches"
  campaigns ||--o{ lead_touches : ""
  leads ||--o{ lead_activities : timeline
  leads ||--o{ calls : ""
  leads ||--o{ followups : ""
  leads ||--o{ stage_history : ""
  leads ||--o{ sales : ""
  campaigns ||--o{ sales : "credited (attribution)"
  sales ||--o{ payments : ""
  users ||--o{ notifications : ""
  users ||--o{ saved_views : ""
  leads ||--o{ message_logs : "email/WhatsApp/SMS"

  leads { int id PK
    varchar lead_code UK "GOD-000001"
    varchar name
    varchar mobile "normalised, indexed"
    varchar email
    varchar source
    varchar channel
    int campaign_id FK
    varchar adset_name
    varchar ad_name
    varchar meta_lead_id UK
    int owner_id FK
    varchar priority "configurable list"
    int stage_id FK
    int score "0-100"
    decimal win_prob "predicted %"
    tinyint consent
    tinyint dnd
    varchar comm_pref
    datetime anonymized_at }
  stages { int id PK
    varchar name UK
    int position
    bool is_won
    bool is_lost
    bool is_qualified
    varchar allowed_next "transition rule" }
  sales { int id PK
    int lead_id FK
    int campaign_id FK
    varchar attribution "first_touch / last_touch"
    decimal order_value
    decimal gross_profit
    varchar invoice_no
    enum status }
  calls { int id PK
    int lead_id FK
    int user_id FK
    datetime started_at
    int duration_sec
    varchar disposition
    varchar recording_url
    varchar provider_call_id }
```

## Tables

| Table | Purpose |
|---|---|
| `users`, `teams` | Employees, 8 roles, hierarchy (`manager_id`, team leader), daily caps/targets, availability, phone, vertical, notification channels |
| `stages` | Configurable pipeline with won/lost/qualified flags and allowed transitions |
| `leads` | One row per customer enquiry (all SRS §4 fields + score, consent, preferences) |
| `lead_touches` | Every campaign/source touch (creation + re-enquiries) — drives first/last-touch attribution |
| `lead_activities` | Timeline: create, edit (with old→new values), notes, calls, stage, assignment, messages, system events |
| `stage_history` | Every stage change with user, time and seconds spent in the previous stage |
| `calls` | Call log (manual or telephony), disposition, duration, recording |
| `followups` | Scheduled follow-ups with assignee, outcome, reminder/escalation flags |
| `campaigns`, `spend_entries` | Campaigns (manual or Meta-synced) and daily spend (manual or Meta, per ad) |
| `sales`, `payments` | Booked sales (credited to one campaign) and payments/refunds |
| `assignment_rules` | Source/campaign/category → team/user routing |
| `notifications`, `message_logs` | In-app notifications; outbound/inbound email, WhatsApp, SMS |
| `audit_logs` | Who did what: create, edit, assign, stage change, export, delete, anonymise, settings |
| `meta_sync_logs` | Every Meta lead webhook/retry/reconcile outcome |
| `jobs` | Background imports/exports with progress and results |
| `error_logs` | Server/integration errors for System health |
| `settings` | Key/value configuration; secrets stored AES-256-GCM encrypted |
| `saved_views` | Per-user saved lead filters |
