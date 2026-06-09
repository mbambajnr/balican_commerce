# Super Admin Setup Guide

The super admin role has unrestricted access to all platform functionality, including approving supplier credit, managing companies with any status, and bypassing business restriction checks.

## 1. Create a User (if they don't exist)

Register normally at `/auth/register` or create via the API.

## 2. Promote to Super Admin

```bash
cd backend
npx tsx src/scripts/promote-admin.ts --email=admin@example.com --role=super_admin --reason="Initial super admin setup"
```

The script:
- Finds the user by email
- Updates their role to `super_admin`
- Creates an audit log entry
- Requires a confirmation prompt (use `--yes` to skip in scripts)

### Other Role Changes

```bash
# Promote to regular admin
npx tsx src/scripts/promote-admin.ts --email=user@example.com --role=admin

# Demote from admin/super_admin back to customer
npx tsx src/scripts/promote-admin.ts --email=user@example.com --role=customer
```

## 3. Verify

Check the audit log in the database:

```sql
SELECT * FROM audit_logs WHERE action LIKE 'role_%' ORDER BY created_at DESC;
```

Or simply log in as the promoted user and verify you can access `/admin`, `/super-admin`, and bypass restricted company workflows.

## How Super Admin Status Works

- **`role = 'super_admin'`** on the `users` table
- The `isSuperAdmin()` middleware function checks `req.user?.role === 'super_admin'` with a fallback to look up from DB
- Super admins bypass `requireCompanyActive()` — they can act on behalf of any company
- Super admins always see prices regardless of `hide_price` or company status
- Super admins can approve/reject provider credit, manage verification documents, etc.

## Access Control

| Feature | Customer | Admin | Super Admin |
|---------|----------|-------|-------------|
| Browse products | ✓ | ✓ | ✓ |
| RFCs/Scout | ✓ | ✓ | ✓ |
| Place orders | Active company only | N/A | ✓ |
| Admin dashboard | — | ✓ | ✓ |
| Approve companies | — | ✓ | ✓ |
| Approve credit | — | ✓ | ✓ |
| Super admin panel | — | — | ✓ |
| Bypass restrictions | — | — | ✓ |

## Troubleshooting

- **"User not found"** — verify the exact email in the DB
- **Role change fails silently** — check the `audit_logs` table exists (run migration if not)
- **Script hangs** — ensure you have the confirmation answer ready or use `--yes`
