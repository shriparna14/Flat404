# CSV Import Report

- **Imported At**: 14/6/2026, 10:54:52 pm
- **Filename**: expenses_export.csv
- **Total Rows Processed**: 42
- **Successful Imports**: 39
- **Discarded Rows (Duplicates)**: 3

## Chronological Operations Log

| Line | Description | Action | Details | Resolution Notes |
|---|---|---|---|---|
| 2 | February rent | **IMPORTED_AS_EXPENSE** | Expense: 48000 INR (₹48000 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 3 | Groceries BigBasket | **IMPORTED_AS_EXPENSE** | Expense: 2340 INR (₹2340 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 4 | Wifi bill Feb | **IMPORTED_AS_EXPENSE** | Expense: 1199 INR (₹1199 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 5 | Dinner at Marina Bites | **IMPORTED_AS_EXPENSE** | Expense: 3200 INR (₹3200 INR) split equal among: Aisha, Rohan, Priya, Dev | Ingested clean record |
| 6 | dinner - marina bites | **DISCARDED** | - | Discarded duplicate of Marina Bites dinner (Row 5) |
| 7 | Electricity Feb | **IMPORTED_AS_EXPENSE** | Expense: 1200 INR (₹1200 INR) split equal among: Aisha, Rohan, Priya, Meera | Removed thousand comma separators |
| 8 | Maid salary Feb | **IMPORTED_AS_EXPENSE** | Expense: 3000 INR (₹3000 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 9 | Movie night snacks | **IMPORTED_AS_EXPENSE** | Expense: 640 INR (₹640 INR) split equal among: Aisha, Rohan, Priya | Normalized casing format of names |
| 10 | Cylinder refill | **IMPORTED_AS_EXPENSE** | Expense: 900 INR (₹900 INR) split equal among: Aisha, Rohan, Priya, Meera | Rounded fractional amount to 2 decimal places |
| 11 | Groceries DMart | **IMPORTED_AS_EXPENSE** | Expense: 1875 INR (₹1875 INR) split equal among: Aisha, Rohan, Priya, Meera | Resolved name nickname alias |
| 12 | Aisha birthday cake | **IMPORTED_AS_EXPENSE** | Expense: 1500 INR (₹1500 INR) split unequal among: Rohan, Priya, Meera | Ingested clean record |
| 13 | House cleaning supplies | **IMPORTED_AS_EXPENSE** | Expense: 780 INR (₹780 INR) split equal among: Aisha, Rohan, Priya, Meera | Assigned missing payer to Aisha.  |
| 14 | Rohan paid Aisha back | **IMPORTED_AS_SETTLEMENT** | Settlement of ₹5000 paid by Rohan to Aisha | Imported as peer settlement payment |
| 15 | Pizza Friday | **IMPORTED_AS_EXPENSE** | Expense: 1440 INR (₹1440 INR) split percentage among: Aisha, Rohan, Priya, Meera | Normalized split percentages to sum to 100%.  |
| 16 | March rent | **IMPORTED_AS_EXPENSE** | Expense: 48000 INR (₹48000 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 17 | Groceries BigBasket | **IMPORTED_AS_EXPENSE** | Expense: 2810 INR (₹2810 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 18 | Wifi bill Mar | **IMPORTED_AS_EXPENSE** | Expense: 1199 INR (₹1199 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 19 | Goa flights | **IMPORTED_AS_EXPENSE** | Expense: 32400 INR (₹32400 INR) split equal among: Aisha, Rohan, Priya, Dev | Ingested clean record |
| 20 | Goa villa booking | **IMPORTED_AS_EXPENSE** | Expense: 540 USD (₹44820 INR) split equal among: Aisha, Rohan, Priya, Dev | Converted USD to INR at rate 83.0.  |
| 21 | Beach shack lunch | **IMPORTED_AS_EXPENSE** | Expense: 84 USD (₹6972 INR) split equal among: Aisha, Rohan, Priya, Dev | Converted USD to INR at rate 83.0.  |
| 22 | Scooter rentals | **IMPORTED_AS_EXPENSE** | Expense: 3600 INR (₹3600 INR) split share among: Aisha, Rohan, Priya, Dev | Ingested clean record |
| 23 | Parasailing | **IMPORTED_AS_EXPENSE** | Expense: 150 USD (₹12450 INR) split equal among: Aisha, Rohan, Priya, Dev | Converted USD to INR at rate 83.0. Excluded Kabir and transferred his share to Dev.  |
| 24 | Dinner at Thalassa | **DISCARDED** | - | Discarded duplicate Thalassa Dinner logged by Aisha (noted as incorrect) |
| 25 | Thalassa dinner | **IMPORTED_AS_EXPENSE** | Expense: 2450 INR (₹2450 INR) split equal among: Aisha, Rohan, Priya, Dev | Ingested clean record |
| 26 | Parasailing refund | **IMPORTED_AS_EXPENSE** | Expense: -30 USD (₹-2490 INR) split equal among: Aisha, Rohan, Priya, Dev | Converted USD to INR at rate 83.0.  |
| 27 | Airport cab | **IMPORTED_AS_EXPENSE** | Expense: 1100 INR (₹1100 INR) split equal among: Aisha, Rohan, Priya, Dev | Normalized casing format of names |
| 28 | Groceries DMart | **IMPORTED_AS_EXPENSE** | Expense: 2105 INR (₹2105 INR) split equal among: Aisha, Rohan, Priya, Meera | Set blank currency to INR |
| 29 | Electricity Mar | **IMPORTED_AS_EXPENSE** | Expense: 1450 INR (₹1450 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 30 | Maid salary Mar | **IMPORTED_AS_EXPENSE** | Expense: 3000 INR (₹3000 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 31 | Dinner order Swiggy | **DISCARDED** | - | Discarded Swiggy order logged with amount 0 (counted twice earlier) |
| 32 | Weekend brunch | **IMPORTED_AS_EXPENSE** | Expense: 2200 INR (₹2200 INR) split percentage among: Aisha, Rohan, Priya, Meera | Normalized split percentages to sum to 100%.  |
| 33 | Meera farewell dinner | **IMPORTED_AS_EXPENSE** | Expense: 4800 INR (₹4800 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 34 | Deep cleaning service | **IMPORTED_AS_EXPENSE** | Expense: 2500 INR (₹2500 INR) split equal among: Aisha, Rohan, Priya | Ingested clean record |
| 35 | April rent | **IMPORTED_AS_EXPENSE** | Expense: 48000 INR (₹48000 INR) split share among: Aisha, Rohan, Priya | Ingested clean record |
| 36 | Groceries BigBasket | **IMPORTED_AS_EXPENSE** | Expense: 2640 INR (₹2640 INR) split equal among: Aisha, Rohan, Priya, Meera | Ingested clean record |
| 37 | Wifi bill Apr | **IMPORTED_AS_EXPENSE** | Expense: 1199 INR (₹1199 INR) split equal among: Aisha, Rohan, Priya | Ingested clean record |
| 38 | Sam deposit share | **IMPORTED_AS_SETTLEMENT** | Settlement of ₹15000 paid by Sam to Aisha | Imported as peer settlement payment |
| 39 | Housewarming drinks | **IMPORTED_AS_EXPENSE** | Expense: 3100 INR (₹3100 INR) split equal among: Aisha, Rohan, Priya, Sam | Ingested clean record |
| 40 | Electricity Apr | **IMPORTED_AS_EXPENSE** | Expense: 1380 INR (₹1380 INR) split equal among: Aisha, Rohan, Priya, Sam | Ingested clean record |
| 41 | Groceries DMart | **IMPORTED_AS_EXPENSE** | Expense: 1990 INR (₹1990 INR) split equal among: Aisha, Rohan, Priya, Sam | Ingested clean record |
| 42 | Furniture for common room | **IMPORTED_AS_EXPENSE** | Expense: 12000 INR (₹12000 INR) split equal among: Aisha, Rohan, Priya, Sam | Ignored redundant split details for equal type |
| 43 | Maid salary Apr | **IMPORTED_AS_EXPENSE** | Expense: 3000 INR (₹3000 INR) split equal among: Aisha, Rohan, Priya, Sam | Ingested clean record |
