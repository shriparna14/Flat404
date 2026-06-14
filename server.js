import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  initDatabase,
  dbRun,
  dbGet,
  dbAll
} from './database.js';
import { analyzeCSV } from './importer.js';
import {
  distributeSplits,
  simplifyDebts,
  calculateAuditLedger
} from './balanceEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = 'flat404_secret_key_long_and_secure';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for memory storage uploads
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE name = ?', [name.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, password, email } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const existing = await dbGet('SELECT * FROM users WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const result = await dbRun(
      'INSERT INTO users (name, password_hash, email) VALUES (?, ?, ?)',
      [name.trim(), passwordHash, email || '']
    );

    // Auto-join the default group (Group ID 1) with join date = today
    const defaultGroup = await dbGet('SELECT id FROM groups LIMIT 1');
    if (defaultGroup) {
      const today = new Date().toISOString().split('T')[0];
      await dbRun(
        'INSERT INTO group_memberships (group_id, user_id, joined_at, left_at) VALUES (?, ?, ?, ?)',
        [defaultGroup.id, result.id, today, null]
      );
    }

    const token = jwt.sign({ id: result.id, name: name.trim() }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.id, name: name.trim(), email: email || '' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// GROUPS AND MEMBERSHIP ROUTES
// ==========================================
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await dbAll(`
      SELECT g.id, g.name, g.created_at, COUNT(m.user_id) as members_count 
      FROM groups g
      LEFT JOIN group_memberships m ON g.id = m.group_id
      GROUP BY g.id
    `);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups/:id/members', authenticateToken, async (req, res) => {
  try {
    const members = await dbAll(`
      SELECT u.id, u.name, u.email, m.joined_at, m.left_at 
      FROM group_memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = ?
    `, [req.params.id]);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add / manage membership timeline
app.post('/api/groups/:id/members', authenticateToken, async (req, res) => {
  const { user_id, joined_at, left_at } = req.body;
  if (!user_id || !joined_at) {
    return res.status(400).json({ error: 'User ID and join date are required' });
  }

  try {
    // Check if membership already exists
    const existing = await dbGet(
      'SELECT id FROM group_memberships WHERE group_id = ? AND user_id = ?',
      [req.params.id, user_id]
    );

    if (existing) {
      await dbRun(
        'UPDATE group_memberships SET joined_at = ?, left_at = ? WHERE id = ?',
        [joined_at, left_at || null, existing.id]
      );
      res.json({ message: 'Membership timeline updated successfully' });
    } else {
      await dbRun(
        'INSERT INTO group_memberships (group_id, user_id, joined_at, left_at) VALUES (?, ?, ?, ?)',
        [req.params.id, user_id, joined_at, left_at || null]
      );
      res.status(201).json({ message: 'Member added to group timeline successfully' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove user membership from timeline
app.post('/api/groups/:id/members/leave', authenticateToken, async (req, res) => {
  const { user_id, left_at } = req.body;
  if (!user_id || !left_at) {
    return res.status(400).json({ error: 'User ID and leave date are required' });
  }

  try {
    await dbRun(
      'UPDATE group_memberships SET left_at = ? WHERE group_id = ? AND user_id = ?',
      [left_at, req.params.id, user_id]
    );
    res.json({ message: 'User marked as left group on the specified date' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// BALANCES AND LEDGER AUDIT ROUTES
// ==========================================
app.get('/api/groups/:id/balances', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  try {
    // 1. Fetch group members
    const members = await dbAll(`
      SELECT u.id, u.name 
      FROM group_memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = ?
    `, [groupId]);

    const memberNames = members.map(m => m.name);
    const balances = {};
    memberNames.forEach(name => { balances[name] = 0.00; });

    // 2. Fetch expenses and splits
    const expenses = await dbAll(`
      SELECT e.id, e.amount_in_inr, u.name as paid_by_name
      FROM expenses e
      JOIN users u ON e.paid_by = u.id
      WHERE e.group_id = ?
    `, [groupId]);

    for (const exp of expenses) {
      // Add paid amount to payer's balance
      if (balances[exp.paid_by_name] !== undefined) {
        balances[exp.paid_by_name] += exp.amount_in_inr;
      }
      
      const splits = await dbAll(`
        SELECT s.amount, u.name as user_name
        FROM expense_splits s
        JOIN users u ON s.user_id = u.id
        WHERE s.expense_id = ?
      `, [exp.id]);

      // Subtract split amount from participant balances
      for (const split of splits) {
        if (balances[split.user_name] !== undefined) {
          balances[split.user_name] -= split.amount;
        }
      }
    }

    // 3. Fetch settlements
    const settlements = await dbAll(`
      SELECT s.amount, u_payer.name as payer_name, u_payee.name as payee_name
      FROM settlements s
      JOIN users u_payer ON s.paid_by = u_payer.id
      JOIN users u_payee ON s.paid_to = u_payee.id
      WHERE s.group_id = ?
    `, [groupId]);

    for (const set of settlements) {
      if (balances[set.payer_name] !== undefined) {
        balances[set.payer_name] += set.amount;
      }
      if (balances[set.payee_name] !== undefined) {
        balances[set.payee_name] -= set.amount;
      }
    }

    // Round balances to 2 decimal places
    Object.keys(balances).forEach(name => {
      balances[name] = Math.round(balances[name] * 100) / 100;
    });

    const simplifiedDebts = simplifyDebts(balances);
    res.json({ balances, simplifiedDebts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rohan's Request: audit ledger endpoint
app.get('/api/groups/:id/ledger/:userId', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.params.userId;

  try {
    const user = await dbGet('SELECT name FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch all expenses in group
    const expenses = await dbAll(`
      SELECT e.id, e.description, e.paid_by as paid_by_id, u.name as paid_by_name, 
             e.amount, e.currency, e.amount_in_inr, e.date
      FROM expenses e
      JOIN users u ON e.paid_by = u.id
      WHERE e.group_id = ?
    `, [groupId]);

    // Fetch all splits for those expenses
    const splits = await dbAll(`
      SELECT s.expense_id, s.user_id, s.amount
      FROM expense_splits s
      JOIN expenses e ON s.expense_id = e.id
      WHERE e.group_id = ?
    `, [groupId]);

    // Fetch all settlements involving this group
    const settlements = await dbAll(`
      SELECT s.id, s.paid_by, s.paid_to, s.amount, s.date, s.notes,
             u_payer.name as paid_by_name, u_payee.name as paid_to_name
      FROM settlements s
      JOIN users u_payer ON s.paid_by = u_payer.id
      JOIN users u_payee ON s.paid_to = u_payee.id
      WHERE s.group_id = ?
    `, [groupId]);

    const ledger = calculateAuditLedger(parseInt(userId, 10), user.name, expenses, splits, settlements);
    res.json({ userName: user.name, ledger });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EXPENSE & SETTLEMENT MANAGEMENT ROUTES
// ==========================================
app.get('/api/groups/:id/expenses', authenticateToken, async (req, res) => {
  try {
    const expenses = await dbAll(`
      SELECT e.*, u.name as paid_by_name 
      FROM expenses e
      JOIN users u ON e.paid_by = u.id
      WHERE e.group_id = ?
      ORDER BY e.date DESC, e.id DESC
    `, [req.params.id]);

    for (const exp of expenses) {
      exp.splits = await dbAll(`
        SELECT s.user_id, s.share, s.amount, u.name as user_name
        FROM expense_splits s
        JOIN users u ON s.user_id = u.id
        WHERE s.expense_id = ?
      `, [exp.id]);
    }

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Manual Expense with Timeline Verification
app.post('/api/groups/:id/expenses', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const {
    description,
    paid_by_name, // Name of the user paying
    amount,
    currency,
    exchange_rate,
    split_type,
    split_with, // Array of names
    split_details, // Object: { Name: value }
    date,
    notes
  } = req.body;

  if (!description || !paid_by_name || !amount || !split_with || !split_with.length || !date) {
    return res.status(400).json({ error: 'Missing required expense fields' });
  }

  try {
    const expDate = new Date(date);

    // Timeline constraint check for split participants
    const memberships = await dbAll(`
      SELECT m.joined_at, m.left_at, u.name, u.id as user_id
      FROM group_memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = ?
    `, [groupId]);

    const activeMembers = [];
    const inactiveMembers = [];

    // Verify payer is active on expense date
    const payerMem = memberships.find(m => m.name === paid_by_name);
    if (!payerMem) {
      return res.status(400).json({ error: `Payer "${paid_by_name}" is not a member of this group.` });
    }
    const payerJoin = new Date(payerMem.joined_at);
    const payerLeft = payerMem.left_at ? new Date(payerMem.left_at) : null;
    if (expDate < payerJoin || (payerLeft && expDate > payerLeft)) {
      return res.status(400).json({
        error: `Payer "${paid_by_name}" was inactive on expense date (${date}). Join date: ${payerMem.joined_at}, Left date: ${payerMem.left_at || 'Present'}`
      });
    }

    // Verify split participants
    for (const name of split_with) {
      const mem = memberships.find(m => m.name === name);
      if (!mem) {
        return res.status(400).json({ error: `Split participant "${name}" is not in group.` });
      }
      const joinDate = new Date(mem.joined_at);
      const leftDate = mem.left_at ? new Date(mem.left_at) : null;

      if (expDate < joinDate || (leftDate && expDate > leftDate)) {
        inactiveMembers.push({
          name,
          joined: mem.joined_at,
          left: mem.left_at || 'Present'
        });
      } else {
        activeMembers.push(mem);
      }
    }

    // Sam's Request: Block/warn inactive member charge
    if (inactiveMembers.length > 0) {
      const namesList = inactiveMembers.map(m => `${m.name} (Joined ${m.joined}, Left ${m.left})`).join(', ');
      return res.status(400).json({
        error: `Cannot charge inactive members on date ${date}: ${namesList}. (Sam's Timeline Rule)`
      });
    }

    // Compute conversions
    const rate = parseFloat(exchange_rate) || 1.0;
    const originalAmt = parseFloat(amount);
    const amountInInr = Math.round((originalAmt * rate) * 100) / 100;

    // Distribute splits
    const splitsInInr = distributeSplits(amountInInr, split_with, split_type, split_details, rate);

    // Save Expense
    const expenseRes = await dbRun(`
      INSERT INTO expenses (group_id, description, paid_by, amount, currency, exchange_rate, amount_in_inr, split_type, date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      groupId,
      description,
      payerMem.user_id,
      originalAmt,
      currency || 'INR',
      rate,
      amountInInr,
      split_type,
      date,
      notes || ''
    ]);

    const expenseId = expenseRes.id;

    // Save splits
    for (const [name, splitAmt] of Object.entries(splitsInInr)) {
      const user = memberships.find(m => m.name === name);
      const userShare = split_details && split_details[name] ? split_details[name] : null;
      await dbRun(`
        INSERT INTO expense_splits (expense_id, user_id, share, amount)
        VALUES (?, ?, ?, ?)
      `, [expenseId, user.user_id, userShare, splitAmt]);
    }

    res.status(201).json({ message: 'Expense saved successfully', expenseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete expense
app.delete('/api/groups/:id/expenses/:expenseId', authenticateToken, async (req, res) => {
  try {
    await dbRun('DELETE FROM expenses WHERE id = ? AND group_id = ?', [req.params.expenseId, req.params.id]);
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settlements APIs
app.get('/api/groups/:id/settlements', authenticateToken, async (req, res) => {
  try {
    const settlements = await dbAll(`
      SELECT s.*, u_payer.name as paid_by_name, u_payee.name as paid_to_name
      FROM settlements s
      JOIN users u_payer ON s.paid_by = u_payer.id
      JOIN users u_payee ON s.paid_to = u_payee.id
      WHERE s.group_id = ?
      ORDER BY s.date DESC
    `, [req.params.id]);
    res.json(settlements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups/:id/settlements', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const { paid_by_name, paid_to_name, amount, date, notes } = req.body;

  if (!paid_by_name || !paid_to_name || !amount || !date) {
    return res.status(400).json({ error: 'Missing required settlement fields' });
  }

  try {
    const payer = await dbGet('SELECT id FROM users WHERE name = ?', [paid_by_name]);
    const payee = await dbGet('SELECT id FROM users WHERE name = ?', [paid_to_name]);

    if (!payer || !payee) {
      return res.status(400).json({ error: 'Payer or payee does not exist' });
    }

    const resSet = await dbRun(`
      INSERT INTO settlements (group_id, paid_by, paid_to, amount, date, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [groupId, payer.id, payee.id, parseFloat(amount), date, notes || '']);

    res.status(201).json({ message: 'Settlement logged successfully', settlementId: resSet.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// IMPORT WIZARD APIS
// ==========================================
app.post('/api/import/analyze', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file.' });
  }

  try {
    const csvContent = req.file.buffer.toString('utf8');
    const result = await analyzeCSV(csvContent);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze CSV: ' + err.message });
  }
});

app.post('/api/import/commit', authenticateToken, async (req, res) => {
  const { groupId, filename, rows } = req.body;
  
  if (!groupId || !rows || !rows.length) {
    return res.status(400).json({ error: 'Group ID and resolved rows are required.' });
  }

  try {
    const memberships = await dbAll(`
      SELECT m.user_id, u.name 
      FROM group_memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = ?
    `, [groupId]);

    const userMap = {};
    memberships.forEach(m => {
      userMap[m.name] = m.user_id;
    });

    const report = {
      imported_at: new Date().toISOString(),
      filename: filename || 'expenses_export.csv',
      total_rows_processed: rows.length,
      imported_count: 0,
      discarded_count: 0,
      actions: []
    };

    // We will process all rows within a transaction to maintain integrity
    await dbRun('BEGIN TRANSACTION');

    for (const r of rows) {
      // 1. If user unchecked the row (discarded/deleted)
      if (r.action === 'discard') {
        report.discarded_count++;
        report.actions.push({
          lineNo: r.lineNo,
          description: r.description,
          action: 'DISCARDED',
          reason: r.resolutionReason || 'User chose to delete/ignore duplicate'
        });
        continue;
      }

      const d = r.data;
      
      // Let's resolve the user IDs for db entries
      const payerId = userMap[d.paid_by];
      if (!payerId) {
        throw new Error(`Payer "${d.paid_by}" has no active membership in Group ${groupId} on line ${r.lineNo}. Must be resolved.`);
      }

      // Check if it is a settlement
      if (d.is_settlement) {
        // Find payee
        const payeeName = d.split_with[0];
        const payeeId = userMap[payeeName];
        if (!payeeId) {
          throw new Error(`Settlement payee "${payeeName}" not found in group on line ${r.lineNo}`);
        }

        const setRes = await dbRun(`
          INSERT INTO settlements (group_id, paid_by, paid_to, amount, date, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          groupId,
          payerId,
          payeeId,
          d.amount, // settlements are always home currency (INR)
          d.date,
          d.notes || `Imported settlement: ${r.description}`
        ]);

        report.imported_count++;
        report.actions.push({
          lineNo: r.lineNo,
          description: r.description,
          action: 'IMPORTED_AS_SETTLEMENT',
          details: `Settlement of ₹${d.amount} paid by ${d.paid_by} to ${payeeName}`,
          reason: r.resolutionReason || 'Identified as direct payment'
        });
      } else {
        // Save expense
        const expRes = await dbRun(`
          INSERT INTO expenses (group_id, description, paid_by, amount, currency, exchange_rate, amount_in_inr, split_type, date, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          groupId,
          d.description,
          payerId,
          d.amount,
          d.currency,
          d.exchange_rate,
          d.amount_in_inr,
          d.split_type,
          d.date,
          d.notes
        ]);

        const expenseId = expRes.id;

        // Distribute splits in INR
        const distributed = distributeSplits(d.amount_in_inr, d.split_with, d.split_type, d.split_details, d.exchange_rate);

        for (const [name, splitAmt] of Object.entries(distributed)) {
          const splitUserId = userMap[name];
          if (!splitUserId) {
            throw new Error(`Split participant "${name}" not found in group on line ${r.lineNo}`);
          }
          const userShare = d.split_details && d.split_details[name] ? d.split_details[name] : null;

          await dbRun(`
            INSERT INTO expense_splits (expense_id, user_id, share, amount)
            VALUES (?, ?, ?, ?)
          `, [expenseId, splitUserId, userShare, splitAmt]);
        }

        report.imported_count++;
        report.actions.push({
          lineNo: r.lineNo,
          description: r.description,
          action: 'IMPORTED_AS_EXPENSE',
          details: `Expense: ${d.amount} ${d.currency} (₹${d.amount_in_inr} INR) split ${d.split_type} among: ${d.split_with.join(', ')}`,
          reason: r.resolutionReason || 'Cleaned and imported'
        });
      }
    }

    // Save report to database
    const reportJsonStr = JSON.stringify(report, null, 2);
    await dbRun(`
      INSERT INTO import_reports (filename, report_json)
      VALUES (?, ?)
    `, [report.filename, reportJsonStr]);

    await dbRun('COMMIT');

    // Write copy of the import report directly to the workspace as required by deliverable #6
    fs.writeFileSync(path.join(__dirname, 'import_report.json'), reportJsonStr, 'utf8');
    
    // Also write a human readable import_report.md
    let mdReport = `# CSV Import Report\n\n`;
    mdReport += `- **Imported At**: ${new Date(report.imported_at).toLocaleString()}\n`;
    mdReport += `- **Filename**: ${report.filename}\n`;
    mdReport += `- **Total Rows Processed**: ${report.total_rows_processed}\n`;
    mdReport += `- **Successful Imports**: ${report.imported_count}\n`;
    mdReport += `- **Discarded Rows (Duplicates)**: ${report.discarded_count}\n\n`;
    mdReport += `## Chronological Operations Log\n\n`;
    mdReport += `| Line | Description | Action | Details | Resolution Notes |\n`;
    mdReport += `|---|---|---|---|---|\n`;
    
    report.actions.forEach(a => {
      mdReport += `| ${a.lineNo} | ${a.description} | **${a.action}** | ${a.details || '-'} | ${a.reason} |\n`;
    });
    
    fs.writeFileSync(path.join(__dirname, 'import_report.md'), mdReport, 'utf8');

    res.status(201).json({ success: true, report });
  } catch (err) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: 'Import transaction failed: ' + err.message });
  }
});

app.get('/api/import/reports', authenticateToken, async (req, res) => {
  try {
    const reports = await dbAll('SELECT id, filename, imported_at FROM import_reports ORDER BY id DESC');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/import/reports/:id', authenticateToken, async (req, res) => {
  try {
    const report = await dbGet('SELECT * FROM import_reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(JSON.parse(report.report_json));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`Shared Expenses Server listening on port ${PORT}`);
    console.log(`Local url: http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });
}

startServer().catch(err => {
  console.error('Server failed to start:', err);
});
