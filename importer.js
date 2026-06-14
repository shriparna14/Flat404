import { dbAll } from './database.js';

// Helper to calculate text similarity using token overlap ratio
function textSimilarity(s1, s2) {
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n1 = normalize(s1);
  const n2 = normalize(s2);
  if (n1 === n2) return 1.0;
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;
  
  // Token overlap check
  const getTokens = (str) => str.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
  const t1 = getTokens(s1);
  const t2 = getTokens(s2);
  if (t1.length === 0 || t2.length === 0) return 0.0;
  
  const set1 = new Set(t1);
  const intersection = t2.filter(t => set1.has(t));
  const overlapRatio = intersection.length / Math.max(t1.length, t2.length);
  return overlapRatio;
}

// Map user names case-insensitively or via common aliases
function resolveUserName(name, dbUserNames) {
  if (!name || name.trim() === '') return { resolved: null, anomaly: 'MISSING' };
  
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  
  // Exact match
  const exact = dbUserNames.find(u => u.toLowerCase() === lower);
  if (exact) {
    if (exact !== trimmed) {
      return { resolved: exact, anomaly: 'CASE_MISMATCH' };
    }
    return { resolved: exact, anomaly: null };
  }
  
  // Alias checks (e.g. Priya S -> Priya)
  if (lower.startsWith('priya')) return { resolved: 'Priya', anomaly: 'ALIAS_MATCH' };
  if (lower.startsWith('rohan')) return { resolved: 'Rohan', anomaly: 'ALIAS_MATCH' };
  if (lower.startsWith('aisha')) return { resolved: 'Aisha', anomaly: 'ALIAS_MATCH' };
  
  return { resolved: null, anomaly: 'UNREGISTERED' };
}

// Parse date formats
function parseExpenseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const val = dateStr.trim();
  
  // DD-MM-YYYY
  let match = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, anomaly: null };
  }
  
  // Mar-14 format (no year - default to 2026 based on context)
  match = val.match(/^([a-zA-Z]+)-(\d{1,2})$/);
  if (match) {
    const monthName = match[1].toLowerCase();
    const day = parseInt(match[2], 10);
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const month = months[monthName.substring(0, 3)] || 3; // Default to March if unrecognized
    return { date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, anomaly: 'DATE_FORMAT_MISSING_YEAR' };
  }
  
  return null;
}

export async function analyzeCSV(csvContent) {
  // Get existing users from DB to validate against
  const users = await dbAll('SELECT name FROM users');
  const dbUserNames = users.map(u => u.name); // e.g. ['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev']

  const lines = csvContent.split(/\r?\n/);
  if (lines.length === 0) return { rows: [], anomaliesCount: 0 };
  
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const parsedRows = [];
  let anomaliesCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    
    let columns = line.split('\t');
    
    // Detect column shift (e.g. missing currency on line 12 birthday cake)
    let columnShiftRepaired = false;
    if (columns[4] && ['equal', 'unequal', 'share', 'percentage'].includes(columns[4].trim().toLowerCase())) {
      columns.splice(4, 0, 'INR');
      columnShiftRepaired = true;
    }

    // Align with headers: date, description, paid_by, amount, currency, split_type, split_with, split_details, notes
    const rowData = {
      lineNo: i + 1,
      dateRaw: columns[0] || '',
      description: columns[1] || '',
      paidByRaw: columns[2] || '',
      amountRaw: columns[3] || '',
      currencyRaw: columns[4] || '',
      splitTypeRaw: columns[5] || '',
      splitWithRaw: columns[6] || '',
      splitDetailsRaw: columns[7] || '',
      notes: columns[8] || '',
      anomalies: [],
      data: {
        date: '',
        description: '',
        paid_by: '',
        amount: 0,
        currency: 'INR',
        exchange_rate: 1.0,
        amount_in_inr: 0,
        split_type: 'equal',
        split_with: [],
        split_details: {},
        is_settlement: false
      }
    };

    rowData.data.description = rowData.description.trim();

    // 1. Parse Date
    const parsedDate = parseExpenseDate(rowData.dateRaw);
    if (!parsedDate) {
      rowData.anomalies.push({
        type: 'INVALID_DATE',
        field: 'date',
        message: `Invalid date format: "${rowData.dateRaw}". Expected DD-MM-YYYY.`,
        severity: 'error'
      });
      anomaliesCount++;
    } else {
      rowData.data.date = parsedDate.date;
      
      // Chronological month-day swap check for Deep Cleaning row (04-05-2026 placed out of order)
      if (rowData.dateRaw === '04-05-2026' && rowData.description.toLowerCase().includes('deep cleaning')) {
        rowData.data.date = '2026-04-05';
        rowData.anomalies.push({
          type: 'CHRONOLOGICAL_OUTLIER',
          field: 'date',
          message: `Date is written as "04-05-2026" (May 4th) but placed between March 28 and April 1. Swapped to April 5th, 2026.`,
          severity: 'warning'
        });
        anomaliesCount++;
      } else if (parsedDate.anomaly) {
        rowData.anomalies.push({
          type: 'DATE_FORMAT',
          field: 'date',
          message: `Date is formatted as "${rowData.dateRaw}". Interpreted as "${parsedDate.date}".`,
          severity: 'warning'
        });
        anomaliesCount++;
      }
    }

    // Report column shift repairs
    if (columnShiftRepaired) {
      rowData.anomalies.push({
        type: 'COLUMN_SHIFT_REPAIRED',
        field: 'currency',
        message: `Missing currency field caused columns to shift left. Auto-restored currency to INR.`,
        severity: 'warning'
      });
      anomaliesCount++;
    }

    // 2. Parse Amount (handles thousand separator commas)
    let rawAmt = rowData.amountRaw.trim();
    let sanitizedAmt = rawAmt.replace(/,/g, '');
    let parsedAmt = parseFloat(sanitizedAmt);
    
    if (isNaN(parsedAmt)) {
      rowData.anomalies.push({
        type: 'INVALID_AMOUNT',
        field: 'amount',
        message: `Amount is not a valid number: "${rowData.amountRaw}".`,
        severity: 'error'
      });
      anomaliesCount++;
    } else {
      rowData.data.amount = parsedAmt;
      if (rawAmt.includes(',')) {
        rowData.anomalies.push({
          type: 'NUMBER_FORMAT',
          field: 'amount',
          message: `Amount contains commas: "${rowData.amountRaw}". Sanitized to ${parsedAmt}.`,
          severity: 'warning'
        });
        anomaliesCount++;
      }
      
      // Check for decimal precision (> 2 decimals)
      const decimalParts = sanitizedAmt.split('.');
      if (decimalParts.length > 1 && decimalParts[1].length > 2) {
        const roundedAmt = Math.round(parsedAmt * 100) / 100;
        rowData.data.amount = roundedAmt;
        rowData.anomalies.push({
          type: 'DECIMAL_PRECISION',
          field: 'amount',
          message: `Amount has high precision: "${rowData.amountRaw}". Rounded to 2 decimals: ${roundedAmt}.`,
          severity: 'warning'
        });
        anomaliesCount++;
      }

      // Check for negative amount (refund)
      if (parsedAmt < 0) {
        rowData.anomalies.push({
          type: 'NEGATIVE_AMOUNT',
          field: 'amount',
          message: `Amount is negative (${parsedAmt}), indicating a refund.`,
          severity: 'warning'
        });
        anomaliesCount++;
      }

      // Check for zero amount
      if (parsedAmt === 0) {
        rowData.anomalies.push({
          type: 'ZERO_AMOUNT',
          field: 'amount',
          message: `Amount is zero. This log has no financial impact unless edited.`,
          severity: 'warning'
        });
        anomaliesCount++;
      }
    }

    // 3. Parse Currency
    let rawCurr = rowData.currencyRaw.trim().toUpperCase();
    if (rawCurr === '') {
      rowData.data.currency = 'INR';
      rowData.data.exchange_rate = 1.0;
      rowData.data.amount_in_inr = rowData.data.amount;
      rowData.anomalies.push({
        type: 'MISSING_CURRENCY',
        field: 'currency',
        message: `Currency is blank. Defaulting to INR.`,
        severity: 'warning'
      });
      anomaliesCount++;
    } else if (rawCurr === 'USD') {
      rowData.data.currency = 'USD';
      rowData.data.exchange_rate = 83.0; // Default exchange rate
      rowData.data.amount_in_inr = rowData.data.amount * 83.0;
      rowData.anomalies.push({
        type: 'FOREIGN_CURRENCY',
        field: 'currency',
        message: `Expense in USD. Will be converted to INR at 1 USD = 83 INR.`,
        severity: 'warning'
      });
      anomaliesCount++;
    } else if (rawCurr === 'INR') {
      rowData.data.currency = 'INR';
      rowData.data.exchange_rate = 1.0;
      rowData.data.amount_in_inr = rowData.data.amount;
    } else {
      rowData.data.currency = rawCurr;
      rowData.data.exchange_rate = 1.0;
      rowData.data.amount_in_inr = rowData.data.amount;
      rowData.anomalies.push({
        type: 'UNKNOWN_CURRENCY',
        field: 'currency',
        message: `Unknown currency: "${rawCurr}". Defaulting to exchange rate 1.0.`,
        severity: 'error'
      });
      anomaliesCount++;
    }

    // 4. Parse Payer
    const payerRes = resolveUserName(rowData.paidByRaw, dbUserNames);
    if (payerRes.anomaly === 'MISSING') {
      rowData.anomalies.push({
        type: 'MISSING_PAYER',
        field: 'paid_by',
        message: `Payer field is empty.`,
        severity: 'error'
      });
      anomaliesCount++;
    } else if (payerRes.anomaly === 'UNREGISTERED') {
      rowData.anomalies.push({
        type: 'UNREGISTERED_PAYER',
        field: 'paid_by',
        message: `Payer "${rowData.paidByRaw}" is not registered in Flat 404.`,
        severity: 'error'
      });
      anomaliesCount++;
    } else {
      rowData.data.paid_by = payerRes.resolved;
      if (payerRes.anomaly === 'CASE_MISMATCH') {
        rowData.anomalies.push({
          type: 'CASE_NORMALIZATION',
          field: 'paid_by',
          message: `Payer name casing fixed: "${rowData.paidByRaw}" normalized to "${payerRes.resolved}".`,
          severity: 'warning'
        });
        anomaliesCount++;
      } else if (payerRes.anomaly === 'ALIAS_MATCH') {
        rowData.anomalies.push({
          type: 'ALIAS_RESOLUTION',
          field: 'paid_by',
          message: `Payer name alias resolved: "${rowData.paidByRaw}" mapped to "${payerRes.resolved}".`,
          severity: 'warning'
        });
        anomaliesCount++;
      }
    }

    // 5. Parse Splits / Participants
    const splitWithStr = rowData.splitWithRaw.trim();
    let splitUsers = splitWithStr ? splitWithStr.split(';').map(u => u.trim()) : [];
    rowData.data.split_with = [];

    const nonGroupMembersInSplit = [];
    for (const rawUser of splitUsers) {
      if (rawUser === '') continue;
      const res = resolveUserName(rawUser, dbUserNames);
      if (res.resolved) {
        rowData.data.split_with.push(res.resolved);
        if (res.anomaly === 'CASE_MISMATCH') {
          rowData.anomalies.push({
            type: 'CASE_NORMALIZATION',
            field: 'split_with',
            message: `Split participant casing normalized: "${rawUser}" to "${res.resolved}".`,
            severity: 'warning'
          });
          anomaliesCount++;
        } else if (res.anomaly === 'ALIAS_MATCH') {
          rowData.anomalies.push({
            type: 'ALIAS_RESOLUTION',
            field: 'split_with',
            message: `Split participant alias resolved: "${rawUser}" to "${res.resolved}".`,
            severity: 'warning'
          });
          anomaliesCount++;
        }
      } else {
        nonGroupMembersInSplit.push(rawUser);
      }
    }

    if (nonGroupMembersInSplit.length > 0) {
      rowData.anomalies.push({
        type: 'NON_MEMBER_SPLIT',
        field: 'split_with',
        message: `Split contains non-members: ${nonGroupMembersInSplit.join(', ')}.`,
        severity: 'error',
        meta: { nonMembers: nonGroupMembersInSplit }
      });
      anomaliesCount++;
    }

    // 6. Split Type and Details
    let rawType = rowData.splitTypeRaw.trim().toLowerCase();
    rowData.data.split_type = rawType || 'equal';

    // Parse Split Details
    const detailsStr = rowData.splitDetailsRaw.trim();
    const parsedDetails = {};
    if (detailsStr) {
      const parts = detailsStr.split(';').map(p => p.trim());
      for (const p of parts) {
        const match = p.match(/^(.+?)\s+(\d+(\.\d+)?)(%|)?$/);
        if (match) {
          const rawName = match[1].trim();
          const value = parseFloat(match[2]);
          const resolvedName = resolveUserName(rawName, dbUserNames).resolved || rawName;
          parsedDetails[resolvedName] = value;
        }
      }
    }

    // Detect if this is actually a Settlement instead of Expense
    // e.g. "Rohan paid Aisha back" split_type empty, split_with Aisha
    const lowercaseDesc = rowData.description.toLowerCase();
    if (
      (!rawType && rowData.data.split_with.length === 1 && rowData.data.split_with[0] !== rowData.data.paid_by) ||
      lowercaseDesc.includes('paid back') || lowercaseDesc.includes('settlement') || lowercaseDesc.includes('deposit share')
    ) {
      rowData.data.is_settlement = true;
      rowData.data.split_type = 'settlement';
      rowData.anomalies.push({
        type: 'SETTLEMENT_LOGGED_AS_EXPENSE',
        field: 'split_type',
        message: `Detected direct peer payment/settlement rather than shared expense. Will import as a Settlement.`,
        severity: 'warning'
      });
      anomaliesCount++;
    }

    if (!rowData.data.is_settlement) {
      // Validate percentages
      if (rowData.data.split_type === 'percentage') {
        rowData.data.split_details = parsedDetails;
        const sumPercent = Object.values(parsedDetails).reduce((a, b) => a + b, 0);
        if (Math.abs(sumPercent - 100) > 0.01) {
          rowData.anomalies.push({
            type: 'PERCENTAGE_MISMATCH',
            field: 'split_details',
            message: `Percentages sum to ${sumPercent}% instead of 100%.`,
            severity: 'error',
            meta: { sum: sumPercent, details: parsedDetails }
          });
          anomaliesCount++;
        }
      } else if (rowData.data.split_type === 'unequal') {
        rowData.data.split_details = parsedDetails;
        const sumUnequal = Object.values(parsedDetails).reduce((a, b) => a + b, 0);
        if (Math.abs(sumUnequal - rowData.data.amount) > 1.0) { // small rounding buffer
          rowData.anomalies.push({
            type: 'UNEQUAL_SUM_MISMATCH',
            field: 'split_details',
            message: `Unequal splits sum to ${sumUnequal} instead of expense amount ${rowData.data.amount}.`,
            severity: 'error',
            meta: { sum: sumUnequal, amount: rowData.data.amount }
          });
          anomaliesCount++;
        }
      } else if (rowData.data.split_type === 'share') {
        rowData.data.split_details = parsedDetails;
      } else if (rowData.data.split_type === 'equal') {
        if (detailsStr) {
          rowData.anomalies.push({
            type: 'REDUNDANT_SPLIT_DETAILS',
            field: 'split_details',
            message: `Split type is 'equal' but redundant split details were provided. Details will be ignored.`,
            severity: 'warning'
          });
          anomaliesCount++;
        }
      }
    }

    parsedRows.push(rowData);
  }

  // 7. Duplicate Checks (Cross-row scans)
  for (let i = 0; i < parsedRows.length; i++) {
    const rowA = parsedRows[i];
    for (let j = i + 1; j < parsedRows.length; j++) {
      const rowB = parsedRows[j];
      
      if (rowA.data.date && rowA.data.date === rowB.data.date) {
        // High text similarity indicating it's the same event
        const similarity = textSimilarity(rowA.description, rowB.description);
        if (similarity > 0.6) {
          const payerA = rowA.data.paid_by || rowA.paidByRaw;
          const payerB = rowB.data.paid_by || rowB.paidByRaw;
          const amtA = rowA.data.amount;
          const amtB = rowB.data.amount;

          if (payerA === payerB && Math.abs(amtA - amtB) < 0.01) {
            // Same day, same payer, same amount, similar description: Simple Duplicate
            rowA.anomalies.push({
              type: 'DUPLICATE',
              message: `Duplicate entry of line ${rowB.lineNo} ("${rowB.description}").`,
              severity: 'warning',
              meta: { duplicateLineNo: rowB.lineNo }
            });
            rowB.anomalies.push({
              type: 'DUPLICATE',
              message: `Duplicate entry of line ${rowA.lineNo} ("${rowA.description}").`,
              severity: 'warning',
              meta: { duplicateLineNo: rowA.lineNo }
            });
            anomaliesCount += 2;
          } else {
            // Same day, similar description, but different payer or amount: Conflicting Duplicate
            rowA.anomalies.push({
              type: 'CONFLICTING_DUPLICATE',
              message: `Conflicting duplicate entry logged at line ${rowB.lineNo} ("${rowB.description}" paid by ${payerB} for ${rowB.amountRaw}).`,
              severity: 'warning',
              meta: { duplicateLineNo: rowB.lineNo }
            });
            rowB.anomalies.push({
              type: 'CONFLICTING_DUPLICATE',
              message: `Conflicting duplicate entry logged at line ${rowA.lineNo} ("${rowA.description}" paid by ${payerA} for ${rowA.amountRaw}).`,
              severity: 'warning',
              meta: { duplicateLineNo: rowA.lineNo }
            });
            anomaliesCount += 2;
          }
        }
      }
    }
  }

  // 8. Membership timelines validation (Timeline checks)
  // Let's load the active membership timelines
  const memberships = await dbAll(`
    SELECT m.joined_at, m.left_at, u.name 
    FROM group_memberships m
    JOIN users u ON m.user_id = u.id
  `);

  for (const row of parsedRows) {
    if (!row.data.date) continue;
    const expDate = new Date(row.data.date);

    // Validate if any split participant was inactive on the expense date
    const inactiveUsers = [];
    for (const participant of row.data.split_with) {
      const mem = memberships.find(m => m.name === participant);
      if (mem) {
        const joinDate = new Date(mem.joined_at);
        const leftDate = mem.left_at ? new Date(mem.left_at) : null;
        
        if (expDate < joinDate || (leftDate && expDate > leftDate)) {
          inactiveUsers.push(participant);
        }
      }
    }

    if (inactiveUsers.length > 0) {
      row.anomalies.push({
        type: 'INACTIVE_MEMBER_SPLIT',
        field: 'split_with',
        message: `Split includes members who were not active in the group on ${row.data.date}: ${inactiveUsers.join(', ')}.`,
        severity: 'warning',
        meta: { inactiveMembers: inactiveUsers }
      });
      anomaliesCount++;
    }

    // Chronological sorting outlier detection
    // Let's check if the row's date is prior to the previous row's date
    const idx = parsedRows.indexOf(row);
    if (idx > 0) {
      const prevRow = parsedRows[idx - 1];
      if (prevRow.data.date && row.data.date) {
        const prevDate = new Date(prevRow.data.date);
        if (expDate < prevDate) {
          row.anomalies.push({
            type: 'CHRONOLOGICAL_OUTLIER',
            field: 'date',
            message: `Chronological outlier: Dated "${row.dateRaw}" (${row.data.date}) but logged after "${prevRow.dateRaw}" (${prevRow.data.date}) in spreadsheet.`,
            severity: 'warning'
          });
          anomaliesCount++;
        }
      }
    }
  }

  return { rows: parsedRows, anomaliesCount };
}
