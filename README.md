# Flat 404 — Shared Expenses App

An elegant, minimalist, high-fidelity Single Page Application (SPA) built to solve shared housing expenses for six flatmates: Aisha, Rohan, Priya, Meera, Sam, and Dev.

This app features a relational database ledger, chronological group occupancy tracking, an auditing tool, debt minimization settlements, and an interactive CSV Ingestion review wizard to clean spreadsheet exports.

---

## 🚀 Setup & Execution Instructions

### Prerequisites
Make sure you have **Node.js (v18+)** and **npm** installed on your machine.

### 1. Install Dependencies
In the root directory of the project, run:
```bash
npm install
```

### 2. Start the Application Server
Run the following command to initialize the SQLite database, seed the default flatmates/timelines, and launch the web server:
```bash
npm start
```
*Note: The database seeds six user accounts with default credentials.*

### 3. Open in Browser
Once running, open your browser and navigate to:
```
http://localhost:3000
```

---

## 🔒 Login Credentials & Demo Accounts
For ease of testing, the Login card features a **"Demo Quick Login"** section. Click on any flatmate's name to automatically sign in as them, or enter credentials manually:

- **Passwords**: The default password for all seeded flatmates (Aisha, Rohan, Priya, Meera, Sam, Dev) is `flatmate123`.
- **Custom Account**: You can register a new account on the Sign Up tab, which automatically joins the `Flat 404` group with membership starting on registration day.

---

## 👥 Flatmate Requests Satisfied

Here is how the system addresses each individual user requirement:

*   **Aisha** (“I just want one number per person. Who pays whom, how much, done.”):
    *   **Resolution**: Implemented the **greedy debt minimization algorithm** (like Splitwise's simplify debts). The dashboard highlights a **"Simplified Settlements"** list showing the absolute minimum transaction paths to settle everyone up, complete with direct "Record Payment" quick-action buttons.
*   **Rohan** (“No magic numbers. If the app says I owe ₹2,300, I want to see exactly which expenses make that up.”):
    *   **Resolution**: Implemented a **Ledger Audit Module**. On the dashboard, selecting any flatmate displays a detailed audit table. This table lists every expense and settlement that impacted their balance, with total amounts, individual splits, and the exact positive/negative impact. It concludes with an auditable sum statement that matches their balance to the penny.
*   **Priya** (“Half the trip was in dollars. The sheet pretends a dollar is a rupee. That can’t be right.”):
    *   **Resolution**: Implemented full **USD and multi-currency support**. During CSV upload, USD items are flagged. The app converts them to INR at a customizable rate (defaults to 1 USD = 83 INR). The database stores the original currency amount alongside the converted INR amount, and all split balances are settled in INR.
*   **Sam** (“I moved in mid-April. Why would March electricity affect my balance?”):
    *   **Resolution**: Developed **chronological occupancy timeline checks** in `group_memberships`. Sam is seeded as moving in on April 10, 2026. The backend validates and blocks anyone from charging Sam for expenses dated before April 10. When creating expenses manually or via CSV import, split checks verify membership dates, fully protecting Sam's balance from March utilities.
*   **Meera** (“Clean up the duplicates — but I want to approve anything the app deletes or changes.”):
    *   **Resolution**: Designed an **Interactive Import Review Wizard**. When `expenses_export.csv` is uploaded, the app scans for 17 distinct anomalies (duplicates, casing, formatting, percentage offsets, column shifts, non-members, timeline conflicts) and displays them as editable cards in a preview screen. Nothing is committed to the database until Meera reviews and clicks "Confirm Ingest".

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js with [Express](https://expressjs.com/) serving static files and API JSON controllers.
- **Database**: [SQLite](https://www.sqlite.org/) relational database via `sqlite3` npm driver.
- **Frontend**: Vanilla ES Modules JavaScript, HTML5, and Vanilla CSS.
- **Styling**: Minimalist custom dark-theme dashboard featuring zinc gray variables, glassmorphic card overlays, fine borders, responsive grids, and CSS transition states (inspired by Vercel and Linear).

---

