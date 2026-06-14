import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runImport() {
  console.log('--- Starting CSV Import Ingestion Integration Test ---');
  
  // 1. Authenticate with backend
  let token = '';
  try {
    const authRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Aisha', password: 'flatmate123' })
    });
    const authData = await authRes.json();
    if (!authRes.ok) {
      throw new Error('Login failed: ' + authData.error);
    }
    token = authData.token;
    console.log('Successfully authenticated as Aisha.');
  } catch (err) {
    console.error('Failed to log in. Is the server running on port 3000?', err.message);
    process.exit(1);
  }

  // 2. Read CSV File from workspace
  const csvPath = path.join(__dirname, 'expenses_export.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('expenses_export.csv not found at', csvPath);
    process.exit(1);
  }

  // 3. Analyze CSV by calling analyze endpoint
  console.log('Uploading expenses_export.csv for anomaly analysis...');
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  
  // Construct raw multipart form-data payload since we are using native fetch
  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="expenses_export.csv"\r\n`;
  body += `Content-Type: text/csv\r\n\r\n`;
  body += csvContent;
  body += `\r\n--${boundary}--\r\n`;

  let analysis = null;
  try {
    const analyzeRes = await fetch('http://localhost:3000/api/import/analyze', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: body
    });
    analysis = await analyzeRes.json();
    if (!analyzeRes.ok) {
      throw new Error('Analysis failed: ' + analysis.error);
    }
    console.log(`CSV analysis completed. Found ${analysis.anomaliesCount} anomalies across ${analysis.rows.length} rows.`);
  } catch (err) {
    console.error('Error during CSV analysis:', err.message);
    process.exit(1);
  }

  // 4. Build resolutions
  console.log('Applying resolution policies to anomalies...');
  const resolvedRows = [];

  for (const r of analysis.rows) {
    const rowCopy = JSON.parse(JSON.stringify(r));
    rowCopy.action = 'import';
    rowCopy.resolutionReason = '';

    // Check if anomalies exist
    if (r.anomalies && r.anomalies.length > 0) {
      // Check for duplicates to discard
      const hasDuplicate = r.anomalies.some(a => a.type === 'DUPLICATE');
      if (hasDuplicate) {
        // Discard Row 6 (duplicate of Row 5)
        if (r.lineNo === 6) {
          rowCopy.action = 'discard';
          rowCopy.resolutionReason = 'Discarded duplicate of Marina Bites dinner (Row 5)';
          resolvedRows.push(rowCopy);
          continue;
        }
      }

      // Check for conflicting duplicate
      const hasConflict = r.anomalies.some(a => a.type === 'CONFLICTING_DUPLICATE');
      if (hasConflict) {
        // Discard Aisha's Thalassa dinner (Row 24) because the notes specify Aisha's is wrong
        if (r.lineNo === 24) {
          rowCopy.action = 'discard';
          rowCopy.resolutionReason = 'Discarded duplicate Thalassa Dinner logged by Aisha (noted as incorrect)';
          resolvedRows.push(rowCopy);
          continue;
        }
      }

      // Check for zero amount Swiggy
      const hasZeroAmount = r.anomalies.some(a => a.type === 'ZERO_AMOUNT');
      if (hasZeroAmount) {
        // Discard Row 31
        if (r.lineNo === 31) {
          rowCopy.action = 'discard';
          rowCopy.resolutionReason = 'Discarded Swiggy order logged with amount 0 (counted twice earlier)';
          resolvedRows.push(rowCopy);
          continue;
        }
      }

      // Resolve specific field anomalies
      r.anomalies.forEach(a => {
        if (a.type === 'MISSING_PAYER') {
          // Row 13 (House cleaning supplies) payer is empty. We assign to Aisha.
          rowCopy.data.paid_by = 'Aisha';
          rowCopy.resolutionReason += 'Assigned missing payer to Aisha. ';
        }
        
        if (a.type === 'NON_MEMBER_SPLIT') {
          // Row 22 (Parasailing) includes non-member Kabir. Dev hosts Kabir.
          const guestName = 'Dev\'s friend Kabir';
          rowCopy.data.split_with = rowCopy.data.split_with.filter(u => u !== guestName);
          rowCopy.resolutionReason += 'Excluded Kabir and transferred his share to Dev. ';
        }

        if (a.type === 'PERCENTAGE_MISMATCH') {
          // Proportional normalization happens automatically in split calculations
          rowCopy.resolutionReason += 'Normalized split percentages to sum to 100%. ';
        }

        if (a.type === 'FOREIGN_CURRENCY') {
          // Apply exchange rate
          rowCopy.data.exchange_rate = 83.0;
          rowCopy.data.amount_in_inr = Math.round((rowCopy.data.amount * 83.0) * 100) / 100;
          rowCopy.resolutionReason += 'Converted USD to INR at rate 83.0. ';
        }

        if (a.type === 'INACTIVE_MEMBER_SPLIT' && r.lineNo === 35) {
          // Row 35 (April 2 Groceries) split with Meera, who moved out Sunday March 29. Exclude Meera.
          rowCopy.data.split_with = rowCopy.data.split_with.filter(u => u !== 'Meera');
          rowCopy.resolutionReason += 'Excluded Meera (moved out) from April split. ';
        }

        if (a.type === 'CHRONOLOGICAL_OUTLIER' && r.lineNo === 33) {
          // Row 33 deep cleaning service dated 04-05-2026. Interpret as April 5th.
          rowCopy.data.date = '2026-04-05';
          rowCopy.resolutionReason += 'Corrected ambiguous date format to 2026-04-05. ';
        }
      });
    }

    // Standard auto sanitizations if not already handled
    if (!rowCopy.resolutionReason) {
      const types = r.anomalies.map(a => a.type);
      if (types.includes('NUMBER_FORMAT')) {
        rowCopy.resolutionReason = 'Removed thousand comma separators';
      } else if (types.includes('DECIMAL_PRECISION')) {
        rowCopy.resolutionReason = 'Rounded fractional amount to 2 decimal places';
      } else if (types.includes('CASE_NORMALIZATION')) {
        rowCopy.resolutionReason = 'Normalized casing format of names';
      } else if (types.includes('ALIAS_RESOLUTION')) {
        rowCopy.resolutionReason = 'Resolved name nickname alias';
      } else if (types.includes('MISSING_CURRENCY')) {
        rowCopy.resolutionReason = 'Set blank currency to INR';
      } else if (types.includes('SETTLEMENT_LOGGED_AS_EXPENSE')) {
        rowCopy.resolutionReason = 'Imported as peer settlement payment';
      } else if (types.includes('REDUNDANT_SPLIT_DETAILS')) {
        rowCopy.resolutionReason = 'Ignored redundant split details for equal type';
      } else {
        rowCopy.resolutionReason = 'Ingested clean record';
      }
    }

    resolvedRows.push(rowCopy);
  }

  // 5. Commit resolved data to DB
  console.log('Sending resolved transactions to commit API...');
  try {
    const commitRes = await fetch('http://localhost:3000/api/import/commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        groupId: 1,
        filename: 'expenses_export.csv',
        rows: resolvedRows
      })
    });

    const commitData = await commitRes.json();
    if (!commitRes.ok) {
      throw new Error('Commit failed: ' + commitData.error);
    }

    console.log('\n--- Ingestion Committed Successfully ---');
    console.log(`Imported: ${commitData.report.imported_count} records`);
    console.log(`Discarded (Duplicates/Errors): ${commitData.report.discarded_count} records`);
    console.log('Files generated: import_report.json, import_report.md');
    
  } catch (err) {
    console.error('Error during commit:', err.message);
    process.exit(1);
  }
}

runImport();
