# DECISIONS.md — Decision Log

This document records the significant architectural and product decisions made during the development of the Shared Expenses App, detailing the options considered, chosen paths, and rationales.

---

## 1. Tech Stack: Single Page Application (SPA) + Express + SQLite

### Options Considered
1. **Next.js / React + PostgreSQL**: Modern, robust, but adds heavy build-time dependencies, slow initial setup, and PostgreSQL requires external Docker containers or local databases running on the reviewer's host machine.
2. **Express + Vanilla SPA (HTML/CSS/JS) + SQLite**: Fast startup, zero bundler configuration, light and robust. Serving pages as static content from Express has near-zero overhead. SQLite is serverless, file-based, and relational, making it 100% portable.

### Decision & Rationale
We chose **Express + Vanilla SPA + SQLite**.
- **Portability**: Reviewer can run `npm install` and `npm start` instantly. No PostgreSQL setup is required, satisfying the "Use relational DBs only" constraint with standard SQL files.
- **Robustness**: Vanilla CSS/JS has zero bundler compile bugs or version mismatch errors. SQLite files are easily inspectable locally.

---

## 2. Managing Group Membership Timelines (Sam's Request)

### Options Considered
1. **Simple Flagging**: Just store whether a user is active or inactive. If active, split expenses.
2. **Start/End Date Timelines in Memberships**: Record a `joined_at` and `left_at` date for each user in `group_memberships`.

### Decision & Rationale
We chose **Start/End Date Timelines**.
- **Historical Accuracy**: This directly solves Sam's request ("I moved in mid-April. Why would March electricity affect my balance?"). If an expense date is set to March 18, the app checks who was in the group on that date. Since Sam joined on April 10, the system prevents charging Sam.
- Meera left on March 31, 2026. If a bill is logged on April 2, Meera is automatically excluded.
- This ensures billing rules are chronologically enforced in both manual forms (blocks creation with helpful validation alerts) and the CSV importer.

---

## 3. CSV Importer Architecture (Meera's Request)

### Options Considered
1. **Silent Automated Ingestion**: Guess resolutions automatically (e.g. auto-delete duplicates, guess payer) and log it silently.
2. **Interactive Wizard (Two-Step API)**:
   - **Step 1 (/api/import/analyze)**: Reads CSV, parses data, scans for 17 anomalies, and returns the JSON analysis.
   - **Step 2 (/api/import/commit)**: Renders cards for each anomaly on the frontend. The user reviews, overrides or approves proposed actions, and commits the finalized payload inside a single SQL transaction.

### Decision & Rationale
We chose the **Interactive Wizard (Two-Step API)**.
- **Meera's Requirement**: Meera requested: "Clean up duplicates — but I want to approve anything the app deletes or changes."
- **Data Integrity**: Surfacing critical data errors (like missing payers) to the user ensures that the database never ingests corrupted or incomplete rows. Committing the final payload in a single SQL transaction (`BEGIN` / `COMMIT`) prevents partial/broken imports if a row fails.

---

## 4. Text Similarity Check for Duplicates

### Options Considered
1. **Exact Description Matching**: Check if description string is identical.
2. **Levenshtein Distance**: Classic edit distance.
3. **Token Overlap Ratio**: Clean non-alphanumeric characters, tokenize, and check the ratio of intersecting words relative to total words.

### Decision & Rationale
We chose **Token Overlap Ratio**.
- **Flexibility**: Identical events are often logged slightly differently (e.g. `Dinner at Marina Bites` vs `dinner - marina bites`). Levinshtein distance penalizes descriptions with minor additions like "at" or hyphens heavily. Token overlap checks if the core nouns match (e.g. `['dinner', 'marina', 'bites']` intersects 100% of the second string), which correctly flags it as a duplicate, while still separating `Thalassa dinner` as a conflict duplicate when amounts or payers differ.

---

## 5. Floating Point Rounding and Remainder Distribution

### Options Considered
1. **Floating-Point Storage**: Save fractions as-is (e.g. `33.33333333333333` for a 3-way split of 100).
2. **Decimal Storage with Remainder Adjustment**: Round splits to 2 decimal places. Calculate the rounding remainder (`total - sum_of_splits`) and adjust the first participant's split by that remainder (e.g. 33.34, 33.33, 33.33).

### Decision & Rationale
We chose **Decimal Storage with Remainder Adjustment**.
- **Auditability**: Using raw floats leads to tiny rounding leakages (like a ledger sum being off by ₹0.01). Rohan's request ("No magic numbers... I want to see exactly which expenses make that up") demands that the sum of split details equals the total amount *exactly*. Adjusting the first participant by the remainder guarantees that `split_sum === total` at a database level, preventing phantom penny errors.

---

## 6. Debt Simplification Algorithm (Aisha's Request)

### Options Considered
1. **Pairwise Debts**: Show debts exactly as they occurred (e.g. Rohan owes Aisha, Aisha owes Priya, Rohan owes Priya). This creates a high number of transactions.
2. **Greedy Debt Minimization**: Calculate net balances (Total Paid - Total Owed) for each user. Group into net debtors (balance < 0) and net creditors (balance > 0). Sort descending and repeatedly match the largest debtor with the largest creditor to resolve balances.

### Decision & Rationale
We chose **Greedy Debt Minimization**.
- **Aisha's Requirement**: "I just want one number per person. Who pays whom, how much, done."
- **Efficiency**: Minimizing transactions is standard in modern expense split apps (like Splitwise). It converts complex N-to-N relationships into a simple 1-to-1 repayment list in $O(N \log N)$ time.
