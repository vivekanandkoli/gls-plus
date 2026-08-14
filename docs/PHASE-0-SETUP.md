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

1. A container runtime. Docker Desktop works, but on Intel Macs it can be flaky —
   **Colima** is a lighter, reliable alternative:
   ```
   brew install colima docker
   colima start --cpu 4 --memory 6 --disk 40
   ```
2. Install the Supabase CLI:
   ```
   brew install supabase/tap/supabase
   ```
3. From the repo root, start the local stack (uses `supabase/config.toml` +
   `supabase/migrations/`). On a slow connection the full image pull can stall —
   start only the services the app needs (much smaller download):
   ```
   supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta
   ```
   This spins up Postgres, Auth (GoTrue), PostgREST, and Kong and applies the
   migration. (`config.toml` already sets `[analytics] enabled=false` because that
   container fails its health check locally and rolls the whole start back.)
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

---

## Lessons from the local bring-up (already handled in code)
- **CSP for local Supabase** — `next.config.ts` allows `http/ws 127.0.0.1:54321`
  in `connect-src` **in development only** (prod stays cloud-only). Without it the
  browser blocks login against local Supabase.
- **Custom `gls` schema** — `config.toml` exposes it in the API (`schemas` +
  `extra_search_path`), and the initial migration grants usage/privileges to the
  `anon` / `authenticated` / `service_role` roles. A fresh cloud project needs the
  same: **Settings → API → Exposed schemas → add `gls`**.
- **Seeing data locally** — `scripts/copy-cloud-to-local.ts` pulls the old cloud
  project into the local two-ledger schema (read-only from cloud), mapping
  `transaction_mode` cash→unofficial / else→official. Run with
  `CLOUD_URL=… CLOUD_KEY=… npx tsx scripts/copy-cloud-to-local.ts`.

## Owner inputs still needed
- **Real opening balances** per book for the current year (stock g + WAC) —
  enter them in **Settings → Opening balances** (or they default to zero /
  the legacy official placeholder).
- **Two free Supabase projects max** — use local (Docker/Colima) for dev to keep
  the free-tier budget for **staging + prod**.
