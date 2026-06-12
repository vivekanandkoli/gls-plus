# GLS Plus — Business Overview & Feature Summary

**Prepared for:** Business Owner  
**Company:** GLS PLUS CO., LTD.  
**Date:** May 2026  
**Application Version:** Current Release

---

## Executive Summary

**GLS Plus** is a purpose-built, web-based operations management system for GLS Techno Thai's gold trading business. The application covers the full cycle of daily operations — from recording purchase and sale transactions, tracking physical gold inventory in grams, computing profit and loss using industry-standard Weighted Average Cost (WAC) accounting, managing client relationships, and producing reports suitable for accountants, auditors, and business owners.

It replaces manual Excel ledgers with a live, multi-user platform that enforces approval workflows, maintains a complete audit trail, and generates professional invoices and financial statements automatically.

---

## What Problem It Solves

| Before GLS Plus | With GLS Plus |
|-----------------|---------------|
| Excel spreadsheets shared manually | Centralized web app, accessible from any device |
| No audit trail for who changed what | Full activity log on every transaction |
| Manual WAC calculations prone to error | Automatic WAC recalculation on every approved transaction |
| Staff could directly modify records | Approval workflow — staff submit, admin reviews |
| Separate tools for invoices, reports, ledger | One integrated platform |
| No role separation (admin vs staff) | Role-based access (Admin / User) |

---

## Who Uses It

### Admin (Business Owner / Manager)
- Full access to all features
- Approve or reject transactions submitted by staff
- View cash transactions and consolidated P&L
- Manage users, view audit trails
- Generate accountant-ready statements

### User (Staff / Counter Staff)
- Create new buy and sell transactions
- Edit or resubmit their own pending/rejected entries
- View approved transactions and client history
- Cannot approve their own work or access financial reports

---

## Core Modules

---

### 1. Dashboard

**What it shows at a glance:**

- **Current Gold Stock** — total grams on hand right now
- **Buy Volume** — total grams and THB purchased (all-time and this month)
- **Sell Volume** — total grams and THB sold (all-time and this month)
- **Low-Stock Alert** — warning when stock falls below your configured threshold
- **Stock Trend Chart** — 90-day rolling chart of gold inventory
- **Monthly Volume Chart** — side-by-side buy vs. sell volume by month
- **Recent Transactions** — last few transactions with status indicators
- **Pending Approval Badge** — instant visibility for admins when staff have submitted transactions awaiting review
- **Profit Summary Card** (Admin) — compares two P&L methods:
  - *Owner Rate Method*: profit using your configured closing gold rate
  - *WAC Method*: profit using the system-calculated cost basis

---

### 2. Transactions

The heart of the system. Every gold buy and sell is recorded here.

#### Transaction Types
| Type | Description |
|------|-------------|
| **BUY** | Purchasing gold (increases inventory) |
| **SELL** | Selling gold (decreases inventory) |

#### Transaction Modes (Admin Only)
| Mode | Description |
|------|-------------|
| **Official** | Standard transactions — included in accountant statements, tax reports |
| **Cash** | Off-book cash transactions — tracked separately, not in CA statements |

#### Transaction Status Flow
```
Staff submits → PENDING → Admin APPROVES → APPROVED (affects stock & P&L)
                        → Admin REJECTS  → REJECTED (with reason; staff can resubmit)

Admin submits → AUTO-APPROVED immediately
```

#### Information Recorded Per Transaction
- Date, client name, invoice number
- Weight in grams, rate per gram, total amount in THB
- VAT percentage, notes
- For SELL transactions: profit/loss vs WAC cost (computed automatically)

#### Key Features
- **Auto-numbered invoices** — BUY: `IV-YYYYMMDD-NNN`, SELL: `UP-YYYYMMDD-NNN`, Cash: `CASH-YYYYMMDD-NNN`
- **P&L preview on SELL** — before submitting a sale, staff see the estimated profit/loss
- **Rate deviation alert** — flags any pending SELL transaction where the rate differs from the current WAC by more than 15%
- **Bulk approve** — admins can approve multiple pending transactions at once
- **CSV export** — export filtered transaction list for external analysis
- **Stock adjustment** — admins can make manual stock corrections with reason tracking

---

### 3. Weighted Average Cost (WAC) Engine

WAC is the international standard for tracking inventory cost in commodity trading (gold, metals, etc.).

#### How It Works
1. The system starts from an **opening balance** (2,331.33 g at 2,859.09 THB/g)
2. Every **BUY** recalculates the new average cost:  
   `New WAC = (Existing Stock Value + Purchase Value) ÷ (Existing Grams + New Grams)`
3. Every **SELL** records the **cost of goods sold** at the current WAC:  
   `Cost = Grams Sold × WAC at that moment`  
   `Profit = Sale Amount − Cost`
4. All calculations run in **chronological order** so the cost basis is always accurate

#### Why This Matters
- Produces accurate, defensible cost-of-goods figures for accounting
- Automatically recalculates when any historical transaction is approved, edited, or deleted
- Supports **two views**: Official-only (for CA) and Physical/combined (for internal use)

#### Admin Tools
- **Migrate**: Add WAC columns to the database if not yet present
- **Backfill**: Recalculate WAC for all historical transactions from scratch
- **Partial Recalculate**: Recalculate from a specific date forward

---

### 4. Clients

A full client directory integrated with transactions.

- Store client name, phone, email
- Each client profile shows:
  - Total gold bought (grams and THB)
  - Total gold sold (grams and THB)
  - Last activity date
  - Full transaction history with the client
- Quick client selection when creating transactions
- Create new clients inline while recording a transaction

---

### 5. Invoices

Professional, printable invoices generated from transaction data.

- Pulls company name, tax ID, address from Settings automatically
- Separate formats for BUY receipts and SELL invoices
- Print directly or download as PDF
- Search and filter invoices by client, date, invoice number
- Admin can edit an invoice number after the fact (with audit logging)

---

### 6. Reports

A suite of analytical and accountant-ready reports.

| Report | What It Shows |
|--------|---------------|
| **Top Buyers** | Clients ranked by purchase volume |
| **Rate Trend** | Buy and sell rate history over time |
| **Monthly Volume** | Buy vs. sell grams by month |
| **Stock Movement** | Running inventory balance over time (from the ledger) |
| **Client P&L** | Per-client margin: what you sold them minus what they sold you |
| **Revenue & Margin** | Monthly revenue vs. cost, gross margin percentage |
| **Manage P&L** | Standalone P&L workbook — import from Excel, add manual entries, full WAC walk (admin) |
| **Statements** | CA-ready monthly, client-by-client, and annual statements (admin) |
| **Cash Report** | All cash-mode transactions (admin only, not in standard statements) |

#### Statements (Admin)
Used to share official figures with your accountant (CA):
- **Monthly Statement**: all approved official transactions for a calendar month with running WAC, stock balance, and period P&L
- **Client Statement**: all transactions with a specific client over a date range
- **Annual Summary**: 12-month rollup including year-end stock value
- All statements can be **printed** or **exported to Excel**

---

### 7. Import & Export

#### Importing Transactions
- **Excel Import Wizard** (4-step process):
  1. Upload your existing Excel file (GLS standard format)
  2. Review parsed data with error highlighting
  3. Confirm and import to database
  4. Automatic WAC recalculation after import
- Validates for duplicates and data errors before committing
- Shows import errors in a downloadable CSV

#### Exporting Data
| Export | Format | Who |
|--------|--------|-----|
| Transaction list | CSV | All |
| Statements | Excel / PDF | Admin |
| Cash report | CSV | Admin |
| Import error report | CSV | All |
| Invoices | Print / PDF | All |

---

### 8. Settings

Configure the system to match your business.

#### Company Information
- Company name (Thai and English)
- Tax ID, phone, email, website
- Two addresses (for invoice printing)
- Company logo

#### Invoice Settings
- Invoice number prefixes for BUY, SELL, and Cash transactions
- Default VAT percentage
- Footer note on invoices

#### Financial Settings
- **Opening Stock Value (THB)** — your starting inventory cost basis for P&L calculations
- **Owner Closing Rate** — the gold rate you use to value end-of-period stock for dashboard P&L
- **Low Stock Threshold** — the gram level that triggers the dashboard warning

#### Admin Tools in Settings
- Rebuild Stock Ledger — recomputes the entire running balance from scratch
- Manage Users — create staff accounts, assign roles, deactivate users
- Activity Log — see every transaction action with who did it and when
- Audit Log — see system-level events like manual stock adjustments

---

### 9. User Management (Admin)

Create and manage staff access:

- Add new users with email and password
- Assign role: **Admin** or **User**
- Activate or deactivate accounts (deactivated users cannot log in)
- Changes are immediate — no server restart required

---

### 10. Activity & Audit Logs

Complete accountability for every action.

#### Transaction Activity Log (`/settings/activity-log`)
Every change to any transaction is recorded:
- Created, edited, approved, rejected, deleted, resubmitted, invoice edited
- Who performed the action and when
- Before and after values for edits

#### System Audit Log (`/settings/audit-log`)
Tracks system-level events such as:
- Manual stock adjustments (with reason and delta)
- Other administrative actions

This means you always have a defensible record of what happened, who did it, and when — important for both internal controls and tax/audit purposes.

---

## How a Typical Day Works

```
Morning:
  Staff opens GLS Plus → sees dashboard with current stock and rates
  Walks-in buyer → staff creates BUY transaction → submits (status: Pending)
  Admin receives badge notification → reviews → approves
  → Stock automatically increases, WAC recalculates

Afternoon:
  Client wants to sell gold → staff creates SELL transaction → submits
  → P&L preview shows estimated profit before submitting
  Admin approves → cost of sale computed at today's WAC → profit locked in

End of Day:
  Admin reviews Dashboard for daily totals
  Downloads / prints invoices for completed transactions
  At month end → generates Monthly Statement for accountant
```

---

## Technical Notes for Business Owner

| Topic | Detail |
|-------|--------|
| **Platform** | Web application — works in any browser, any device |
| **Data Storage** | Supabase (managed PostgreSQL cloud database) — data is backed up automatically |
| **Authentication** | Email and password login per user |
| **Security** | Role-based access enforced on every API call; staff cannot bypass via URL |
| **Invoice numbering** | Automatic, sequential, year-aware (no duplicates within a year) |
| **Multi-currency** | Currently THB only |
| **Units** | Weight in grams (g) |
| **Accounting method** | WAC (Weighted Average Cost) — standard for precious metals |
| **Offline** | Requires internet connection |

---

## Key Numbers (Opening Configuration)

| Item | Value |
|------|-------|
| Opening Stock | 2,331.33 grams |
| Opening Stock Value | 6,665,493.20 THB |
| Opening WAC | 2,859.09 THB/gram |

These are the starting figures from which all WAC calculations grow forward.

---

## Summary of Business Value

1. **No more spreadsheet errors** — WAC is calculated automatically and recalculated whenever data changes
2. **Staff accountability** — nothing goes into the books without admin approval
3. **Full audit trail** — every change is logged; nothing can be silently altered
4. **Two sets of books, one system** — official transactions for CA, cash transactions for internal view
5. **Instant profit visibility** — know your P&L margin on every sale at the moment of entry
6. **Professional invoices** — generated from live data, always accurate
7. **Accountant-ready exports** — monthly statements in Excel format for your CA

---

*This document was generated from the GLS Plus codebase as of May 2026.*
