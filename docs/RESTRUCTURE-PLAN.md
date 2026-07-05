# GLS Plus — Restructure Plan

**Status:** Draft for owner review · **Date:** 2026-07-05

This document captures the agreed model, the target architecture, a phased build
plan, and the environment / release strategy. It supersedes the old
single-ledger + "cash mode" design.

---

## 1. The confirmed model

Two **independent** ledgers. They are never added together.

| | **Unofficial ledger** | **Official ledger** |
|---|---|---|
| Meaning | The truth — every real trade | The declared-for-tax view |
| Physical stock | **This is the real vault** | Tax-book stock only |
| Owner's actual P/L | **Yes — this is it** | No (tax P/L only) |
| Payment modes | Cash only | Bank, QR, Cheque, Cash |
| Profit method | Own WAC chain | Own WAC chain |
| In audit / CA reports | No | Yes |
| Invoice series | New distinct series (see §3) | IV- (buy) / UP- (sell) |

- Each ledger has its **own opening balance**, its **own running WAC**, its **own
  stock**, set at the **start of each year**.
- WAC runs **continuously** from the year's opening balance. The home page always
  shows the **current live WAC** for the current year (both books).
- **Actual P/L = unofficial P/L.** Official P/L is for tax only.
- The **combined report** is a *reconciliation*: unofficial (real) vs official
  (declared), side by side, with the variance — **not a sum**.

---

## 2. Data model (Postgres, `gls` schema)

Single `transactions` table with a `book` discriminator (one code path, filter by
book) rather than two near-identical tables.

**`transactions`**
- `id`, `book` (`official` | `unofficial`), `date`, `type` (`BUY` | `SELL`)
- `client_id`, `weight_gm`, `rate_per_gram`, `amount_thb`
- `payment_mode` (`bank` | `qr` | `cheque` | `cash`)
- `invoice_number`, `vat_percent` (official only), `notes`
- `status` (`pending` | `approved` | `rejected`), `rejection_reason`
- `wac_at_txn`, `cost_of_sale`, `wac_profit_loss` (computed on approval)
- `created_by`, `approved_by`, `approved_at`, timestamps
- **Constraint:** `book = 'unofficial'` ⇒ `payment_mode = 'cash'`.

**`opening_balances`** — `year`, `book`, `opening_stock_gm`, `opening_wac`,
`opening_stock_value_thb`. One row per (year, book).

**`stock_adjustments`** — `book`, `date`, `delta_gm`, `reason`, `adjusted_by`
(admin), `created_at`. Manual corrections when the counted vault drifts from the
calculated stock.

**`invoice_counters`** — per (book, date, type), for sequential invoice numbers.

**`activity_log`** — unchanged: who did what, when, before/after.

**Deals folded in:** a "deal" (paired buy + sell entered together) becomes two
linked `transactions` rows in the chosen book. No separate `deals` table
long-term.

---

## 3. Invoice numbering

- **Official BUY:** `IV-YYYYMMDD-NNN` · **Official SELL:** `UP-YYYYMMDD-NNN` (unchanged)
- **Unofficial:** new distinct, owner-recognizable series. Proposed:
  `PV-YYYYMMDD-NNN` (**P**rivate **V**ault) for both buy and sell, or
  `UB-` / `US-` (Unofficial Buy / Sell). **→ owner to pick the prefix.**

---

## 4. App restructure

- **Nav:** add **Transactions** (primary ledger, with an Official / Unofficial
  toggle). "Deals" becomes a quick paired-entry action that writes to
  `transactions`.
- **Dashboard:**
  - Current **unofficial WAC + stock** (the real vault) — primary.
  - Current **official WAC + stock** — secondary.
  - **Actual P/L** (unofficial) — primary. **Tax P/L** (official) — secondary.
  - **Reconciliation card** (real vs declared + variance). No summed "combined"
    number.
  - Low-stock alert per book.
- **Transactions pages:** create / edit / approve / reject, filtered by book.
  Official shows tax fields (VAT, any payment mode); unofficial is cash-only.
- **Invoices:** two clearly-labeled series.
- **Reports:** (a) Official statements (CA-ready, official only), (b) Owner actual
  (unofficial), (c) Reconciliation (both + variance), all printable / Excel.
- **Settings:** opening balances per year per book; low-stock thresholds per book;
  admin-only stock adjustment tool.
- **RBAC:** Admin = everything incl. approvals, official book, adjustments, users.
  Staff = create/edit own pending entries, view approved.

---

## 5. Open operational detail (to confirm during build, not a blocker)

**How official entries get created.** Since actual P/L = unofficial alone, all real
trades live in the unofficial book. Officially-declared trades then need to exist
in the official book too. Two options:
- **(A) Independent double-entry** — official and unofficial are maintained
  separately; the owner/accountant decides what to declare (may use adjusted
  numbers). Simple, flexible, but declared real trades are entered twice.
- **(B) Linked declaration** — record the real trade once (unofficial), tick
  "declare officially" to spawn a linked official entry (optionally with an
  adjusted rate/amount for tax). No double entry.

Recommendation: start with **(A)** for v1 (simplest), add **(B)** later as a
convenience. Confirm when we reach Phase 2.

---

## 6. Phased build plan

- **Phase 0 — Environments & tooling** (do first): Supabase CLI + local stack,
  staging + prod projects, Vercel env wiring, migration workflow, CI skeleton.
- **Phase 1 — Data model:** new schema (transactions+book, opening_balances,
  stock_adjustments), wipe old data, per-book WAC engine.
- **Phase 2 — Transactions module:** create/edit/approve/reject, two books,
  invoices, WAC on approval. (Resolve §5 here.)
- **Phase 3 — Dashboard:** current WAC/stock per book, actual vs tax P/L,
  reconciliation card.
- **Phase 4 — Reports:** official statements, owner actual, reconciliation.
- **Phase 5 — Deals folded in** (paired entry) + stock-adjustment UI.
- **Phase 6 — Hardening:** RBAC verification, audit log, polish, edge cases.

---

## 7. Environment & release plan

**Topology**
- **Local / test:** Supabase CLI (Docker) — free, fully isolated; where migrations
  are authored and automated tests run.
- **Staging (pre-prod):** one free Supabase project; Vercel **Preview**
  deployments point here.
- **Production:** a second free Supabase project; Vercel **Production** (main
  branch) points here. *Caveat: free projects pause after inactivity — move prod
  to Supabase Pro (~$25/mo) before real business use.*

**Git / deploy flow**
- Feature branch → PR → Vercel Preview (staging DB) → review.
- Merge to `main` → Vercel Production deploy + prod migration (manual approval
  gate).
- Migrations authored as SQL in `supabase/migrations/` via the CLI; applied
  local → staging → prod.

**CI (GitHub Actions)**
- On PR: lint, typecheck, build, tests.
- On merge to `main`: deploy + run migrations against prod (gated).

**Env vars** (per Vercel environment): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

---

## 8. Decisions still needed from owner

1. Unofficial invoice prefix (§3).
2. Confirm official-entry mechanic A vs B when we reach Phase 2 (§5).
3. Opening stock figures (gm, WAC) for **each book** for the current year.
