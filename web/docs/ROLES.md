# Role-permission matrix (SRS §10, §17, §21.6)

Defaults below. Admins can change every role except Super Admin in **Settings → Roles & permissions**; Super Admin always keeps all permissions so the company cannot lock itself out. Code: `PERMISSIONS` in `src/lib/auth.ts`.

| Permission | Super Admin | Admin | Sales Mgr | Team Leader | Calling Exec | Sales Exec | Marketing Mgr | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View all leads | ✓ | ✓ | ✓ | | | | ✓ | ✓ |
| View team's leads | ✓ | ✓ | | ✓ | | | | |
| Edit leads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| Create leads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Assign / transfer | ✓ | ✓ | ✓ | ✓ | | | | |
| Delete / anonymise | ✓ | ✓ | | | | | | |
| Export | ✓ | ✓ | ✓ | | | | ✓ | |
| Import | ✓ | ✓ | ✓ | | | | ✓ | |
| Campaigns & spend | ✓ | ✓ | | | | | ✓ | |
| Sales & payments | ✓ | ✓ | ✓ | | | ✓ | | |
| Users & teams | ✓ | ✓ | | | | | | |
| Settings | ✓ | | | | | | | |
| Reports & MIS | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ |
| Audit log | ✓ | ✓ | | | | | | |
| Log calls | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |

**Record visibility:** "View all" → every lead; "View team" → own + team members' leads; neither → only leads the user owns. A user tied to a **vertical** (Team page) additionally sees only leads of that category. Every lead query goes through `leadScope()`; a lead outside scope returns 404.

**Extra rules:** only a Super Admin can create/edit a Super Admin or download database backups. Export masking (Settings) hides mobile/email for everyone except Super Admin.
