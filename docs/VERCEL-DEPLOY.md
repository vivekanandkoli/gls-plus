# Production deployment - Vercel + finance-manager

Prereqs (done): main builds (next build green); finance-manager migrated to the
two-ledger schema with data; prod admin account exists.

## 1. Environment variables (Vercel -> Project -> Settings -> Environment Variables)
Set for the Production environment (and Preview if used):

| Name | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://zmmoeslgjisvhuhixpau.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | finance-manager publishable/anon key (Supabase -> Settings -> API) |
| SUPABASE_URL | https://zmmoeslgjisvhuhixpau.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | finance-manager service_role key (Supabase -> Settings -> API) |

After you rotate keys (step 6), update these in Vercel and redeploy.
Never commit these - .env.local stays local/dev only.

## 2. Deploy
1. main is pushed to GitHub (it is).
2. vercel.com -> Add New... -> Project -> import vivekanandkoli/gls-plus.
3. Framework preset: Next.js (auto). Build/output: defaults.
4. Add the 4 env vars above (Production).
5. Deploy.

## 3. Supabase auth URLs (so login/email links point at prod, not localhost)
Supabase -> Authentication -> URL Configuration:
- Site URL = your Vercel production URL
- Redirect URLs = add the same URL (and custom domain if any)

## 4. Confirm the API exposes the gls schema
Supabase -> Settings -> API -> Exposed schemas must include gls (it already does).

## 5. Smoke test (deployed URL)
- Log in as admin -> Dashboard loads (no errors)
- Transactions list + New transaction (both books)
- Reports -> statement + reconciliation
- Create/approve/delete a test transaction

## 6. Security - immediately after a successful deploy
- Rotate DB password (Settings -> Database -> Reset password).
- Reset service_role + anon keys (Settings -> API) - exposed during setup.
  Update Vercel env + redeploy.
- Change admin password from the temporary one (first login).
- Email confirmation ON for new signups (Auth -> Providers -> Email).

## Rollback
Old data: backups/finance-manager-20261003/. Pre-restructure code: commit 5746650.
