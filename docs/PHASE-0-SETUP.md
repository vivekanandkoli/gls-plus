# Phase 0 — Environment setup checklist

This is the one phase that needs **your** hands: creating cloud projects and
authorising CLIs can't be done for you. Everything else (schema, app code) is
built in the repo and runs against whatever database these steps point at.

Target topology (see `docs/RESTRUCTURE-PLAN.md` §7):

| Environment | Database | Deploys from |
|---|---|---|
| Local / test | Supabase CLI (Docker) | your machine |
| Staging (pre-prod) | Supabase free project #1 | Vercel Preview |
| Production | Supabase free project #2 | Vercel Production (main) |

---

## A. Local dev (do this first — unblocks everything)

1. Install Docker Desktop and start it.
2. Install the Supabase CLI:
   ```
   brew install supabase/tap/supabase
   ```
3. From the repo root, start the local stack (uses `supabase/config.toml` +
   `supabase/migrations/`):
   ```
   supabase start
   ```
   This spins up Postgres, Auth, and Studio locally and applies the migration.
4. Note the printed **API URL**, **anon key**, and **service_role key**, and put
   them in `.env.local` (see `.env.example`). Point the app at local Supabase.
5. Create local auth users + their `gls.users` profiles:
   ```
   npm run seed:demo-users
   ```
6. `npm run dev` → the app now runs against your fully isolated local database.

Reset the local DB anytime (re-applies migrations + `supabase/seed.sql`):
```
supabase db reset
```

## B. Staging + Production projects

1. In the Supabase dashboard, create **two** projects: `gls-plus-staging` and
   `gls-plus-prod`. Save each project's URL + anon key + service_role key + db
   password.
2. Link and push migrations to each:
   ```
   supabase link --project-ref <staging-ref>
   supabase db push
   # then repeat for prod
   supabase link --project-ref <prod-ref>
   supabase db push
   ```

## C. Vercel

1. Import the repo into Vercel.
2. Set environment variables **per environment** (Preview → staging, Production →
   prod): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
3. Production deploys from `main`; every PR gets a Preview pointing at staging.

## D. GitHub Actions (CI)

`.github/workflows/ci.yml` runs lint + typecheck + build on every PR.
Add repo secrets later for auto-migrating staging/prod on merge (documented in
the workflow file).

---

### Notes / caveats
- Free Supabase projects **pause after ~1 week idle** — fine for staging; move
  **prod to Supabase Pro (~$25/mo)** before real business use.
- Never run `supabase db push` against prod without first verifying on staging.
- The existing live Supabase project (the one the app currently uses) is **not**
  touched by any of this — treat it as the old system until prod is ready.
