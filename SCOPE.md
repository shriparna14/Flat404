# SCOPE.md — Anomaly Log & Database Schema

This document details:
1. **The Anomaly Ingestion Log**: Every data problem identified in `expenses_export.csv` and the resolution policy applied.
2. **The Database Schema**: The relational database design implemented in SQLite.

---

## 1. CSV Anomaly Ingestion Log

We detected and resolved **17 distinct data anomalies** during the ingestion of `expenses_export.csv`:

| # | CSV Line | Description | Identified Problem | Resolution Policy & Ingestion Rule |
|---|---|---|---|---|
| **1** | Line 5 vs 6 | `Dinner at Marina Bites` vs `dinner - marina bites` | **Duplicate Entry**: Same date, same amount (₹3200), same payer (Dev), similar description. | **Discard Duplicate**: Identified via token overlap string similarity. Row 6 was discarded, keeping Row 5. |
| **2** | Line 7 | `Electricity Feb` | **Formatting Error**: Amount is written as `1,200` (contains comma). | **Auto-Sanitize**: Comma stripped before parsing as float, resolving to `1200.00`. |
| **3** | Line 9 | `Movie night snacks` | **Name Casing Casing**: Payer name is `priya` in lowercase. | **Normalize casing**: Automatically mapped to the database-registered user `Priya`. |
| **4** | Line 10 | `Cylinder refill` | **Fractional Currency**: Amount is `899.995` (3 decimal places, invalid for paise). | **Decimal Precision Rounding**: Rounded automatically to 2 decimal places (`900.00`). |
| **5** | Line 11 | `Groceries DMart` | **Inconsistent User Name**: Paid by `Priya S` instead of `Priya`. | **Alias Resolution**: Mapped automatically to official registered user `Priya`. |
| **6** | Line 12 | `Aisha birthday cake` | **Shifted Columns / Missing Currency**: Currency column was omitted, shifting columns left. `unequal` became currency, and splits became split_type. | **Column Repair**: Automatically detected shift. Restored currency as `INR`, shifted columns back to the right. Correctly parsed unequal splits (Rohan: 700, Priya: 400, Meera: 400) and notes. |
| **7** | Line 13 | `House cleaning supplies` | **Missing Payer**: `paid_by` column left blank. | **Interactive Resolution**: Importer blocks until resolved. Assigned to Aisha (default fallback host) and logged. |
| **8** | Line 14 | `Rohan paid Aisha back` | **Settlement Logged as Expense**: Peer-to-peer repayment of ₹5000, empty split type. | **Record Type Conversion**: Ingested as a direct Peer Settlement, reducing Rohan's debt to Aisha without affecting shared group balances. |
| **9** | Line 15 | `Pizza Friday` | **Incorrect Percentage Sum**: Split percentages (30%, 30%, 30%, 20%) sum to 110% instead of 100%. | **Proportional Normalization**: Re-scaled percentages proportionally (divide by 1.1) to sum to 100.00% exactly (27.27%, 27.27%, 27.27%, 18.18%). |
| **10**| Line 20, 21 | `Goa villa booking`, `Beach shack lunch` | **Foreign Currency (USD)** | **Currency Conversion**: Converted USD to INR using a standard fixed exchange rate of 1 USD = 83 INR. Stored original amount/currency and converted INR value. |
| **11**| Line 23 | `Parasailing` | **Non-member split & USD**: Split includes `Dev's friend Kabir` (unregistered guest). | **Guest Share Redirection**: Dev acts as Kabir's host; Kabir's share was added to Dev's share, and Kabir was removed. Converted USD to INR at rate 83.0. |
| **12**| Line 24 vs 25 | `Dinner at Thalassa` vs `Thalassa dinner` | **Conflicting Duplicate Log**: Two entries for same event, different payers (Aisha vs Rohan) and different amounts (2400 vs 2450). | **Discard Incorrect Duplicate**: Notes specify Aisha's log is wrong. Ingestion kept Rohan's entry (Line 25) and discarded Aisha's (Line 24). |
| **13**| Line 26 | `Parasailing refund` | **Negative Amount (Refund)** | **Refund Processing**: Ingested as negative expense (amount -30 USD, converted to -₹2490 INR) split equally, reducing the net amounts owed. |
| **14**| Line 27 | `Airport cab` | **Weird Date Format & Casing**: Date is written as `Mar-14`, name as `rohan` (lowercase). | **Standardize Date & Names**: Date parsed to `2026-03-14`. Payer name casing normalized to `Rohan`. |
| **15**| Line 28 | `Groceries DMart` | **Missing Currency** | **Default Currency**: Defaulted blank currency field to group home currency (INR). |
| **16**| Line 31 | `Dinner order Swiggy` | **Zero Amount Log**: Amount is `0` INR. Note says "counted twice earlier - fixing later". | **Discard Double Log**: Discarded zero-amount entry, preventing empty logs from cluttering database. |
| **17**| Line 32 | `Weekend brunch` | **Incorrect Percentage Sum**: Percentages sum to 110%. | **Proportional Normalization**: Re-scaled percentages to sum to 100% (Aisha: 27.27%, Rohan: 27.27%, Priya: 27.27%, Meera: 18.18%). |
| **18**| Line 34 | `Deep cleaning service` | **Ambiguous Date Format / Out of Order**: Date `04-05-2026` placed chronologically between March 28 and April 1. | **Chronological Day/Month Swap**: Swapped month/day to `2026-04-05` (April 5, 2026) to match spreadsheet context positioning. |
| **19**| Line 35 | `April rent` | **Chronological Outlier**: April 1 rent placed after April 5 deep cleaning. | **Sort Ingestion**: Kept correct date of April 1, sorted chronologically in database ledger. |
| **20**| Line 36 | `Groceries BigBasket` | **Inactive Member in Split**: Split includes `Meera` who moved out end of March. | **Timeline Enforcement**: Removed Meera from split; re-split remaining amount equally among active members (Aisha, Rohan, Priya). |
| **21**| Line 38 | `Sam deposit share` | **Settlement Logged as Expense**: Deposit transfer from Sam to Aisha. | **Record Type Conversion**: Ingested as direct Peer Settlement. |
| **22**| Line 42 | `Furniture for common room`| **Redundant Split Details**: Split type is `equal` but share details are redundant. | **Clean Ingestion**: Stripped details, processed as standard equal split. |

---

## 2. Database Schema (SQLite Relational Design)

### Entity-Relationship Diagram

```
 +---------------+          +------------------+          +---------------+
 |     users     | 1      * |group_memberships | *      1 |    groups     |
 |---------------|----------|------------------|----------|---------------|
 | id (PK)       |          | id (PK)          |          | id (PK)       |
 | name (UNIQUE) |          | group_id (FK)    |          | name          |
 | password_hash |          | user_id (FK)     |          | created_at    |
 | email         |          | joined_at (DATE) |          +---------------+
 | created_at    |          | left_at (DATE)   |                  | 1
 +---------------+          +------------------+                  |
         | 1                                                      |
         |                                                        |
         +----------------------------------+                     |
         |                                  |                     |
         | 1 (pays)                         | 1 (payer/payee)     | * (contains)
         v                                  v                     v
 +---------------+                  +---------------+     +---------------+
 |   expenses    | 1              * |  settlements  |     |import_reports |
 |---------------|------------------|---------------|     |---------------|
 | id (PK)       |                  | id (PK)       |     | id (PK)       |
 | group_id (FK) |                  | group_id (FK) |     | imported_at   |
 | description   |                  | paid_by (FK)  |     | filename      |
 | paid_by (FK)  |                  | paid_to (FK)  |     | report_json   |
 | amount        |                  | amount (INR)  |     +---------------+
 | currency      |                  | date (DATE)   |
 | exchange_rate |                  | notes         |
 | amount_in_inr |                  | created_at    |
 | split_type    |                  +---------------+
 | date (DATE)   |
 | notes         |
 | created_at    |
 +---------------+
         | 1
         |
         | * (splits)
         v
 +------------------+
 |  expense_splits  |
 |------------------|
 | id (PK)          |
 | expense_id (FK)  |
 | user_id (FK)     |
 | share (DECIMAL)  |
 | amount (INR)     |
 +------------------+
```

### SQL DDL Statements

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Groups table
CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Group memberships (implements timelines to solve Sam's request)
CREATE TABLE group_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at DATE NOT NULL,
  left_at DATE, -- NULL represents currently active
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Expenses table
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  paid_by INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  amount_in_inr DECIMAL(10,2) NOT NULL,
  split_type TEXT NOT NULL, -- equal, unequal, share, percentage
  date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(paid_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Expense splits (breakdown of debts per user, solves Rohan's request)
CREATE TABLE expense_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  share DECIMAL(10,4), -- percentage value, share ratio, or custom amount
  amount DECIMAL(10,2) NOT NULL, -- exact amount owed in base currency (INR)
  FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settlements table (saves repayments, solves Aisha's request)
CREATE TABLE settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  paid_by INTEGER NOT NULL,
  paid_to INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(paid_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(paid_to) REFERENCES users(id) ON DELETE CASCADE
);

-- Import reports table
CREATE TABLE import_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  filename TEXT NOT NULL,
  report_json TEXT NOT NULL
);
```
