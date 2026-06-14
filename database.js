import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = process.env.PERSISTENT_DIR || __dirname;
const dbPath = path.join(dbDir, 'data.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Wrap sqlite3 operations in Promises for cleaner async/await usage
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export async function initDatabase() {
  // 1. Enable foreign key support
  await dbRun('PRAGMA foreign_keys = ON');

  // 2. Create Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Create Groups Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Create Group Memberships Table with timelines (joined_at, left_at)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATE NOT NULL,
      left_at DATE,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 5. Create Expenses Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      paid_by INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
      amount_in_inr DECIMAL(10,2) NOT NULL,
      split_type TEXT NOT NULL,
      date DATE NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY(paid_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 6. Create Expense Splits Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      share DECIMAL(10,4),
      amount DECIMAL(10,2) NOT NULL,
      FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 7. Create Settlements Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settlements (
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
    )
  `);

  // 8. Create Import Reports Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS import_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      filename TEXT NOT NULL,
      report_json TEXT NOT NULL
    )
  `);

  console.log('Database tables verified/created successfully.');
  await seedDefaultData();
}

async function seedDefaultData() {
  const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
  if (userCount.count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding default flatmates and membership timelines...');

  // Default flatmates password is 'flatmate123'
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('flatmate123', salt);

  const flatmates = [
    { name: 'Aisha', email: 'aisha@flat404.in' },
    { name: 'Rohan', email: 'rohan@flat404.in' },
    { name: 'Priya', email: 'priya@flat404.in' },
    { name: 'Meera', email: 'meera@flat404.in' },
    { name: 'Sam', email: 'sam@flat404.in' },
    { name: 'Dev', email: 'dev@flat404.in' }
  ];

  const userIds = {};
  for (const mate of flatmates) {
    const res = await dbRun(
      'INSERT INTO users (name, password_hash, email) VALUES (?, ?, ?)',
      [mate.name, passwordHash, mate.email]
    );
    userIds[mate.name] = res.id;
  }

  // Create default group
  const groupRes = await dbRun('INSERT INTO groups (name) VALUES (?)', ['Flat 404']);
  const groupId = groupRes.id;

  // Timelines based on project prompt:
  // February onwards: Aisha, Rohan, Priya, Meera.
  // Dev visited in Feb/Mar (e.g. joined for weekend/Goa trip, left mid-March).
  // Meera moved out end of March.
  // Sam moved in mid-April (approx April 10).
  const memberships = [
    { name: 'Aisha', joined: '2026-02-01', left: null },
    { name: 'Rohan', joined: '2026-02-01', left: null },
    { name: 'Priya', joined: '2026-02-01', left: null },
    { name: 'Meera', joined: '2026-02-01', left: '2026-03-31' },
    { name: 'Dev', joined: '2026-02-01', left: '2026-04-01' }, // Stayed active until Goa trip finished and settled
    { name: 'Sam', joined: '2026-04-10', left: null }
  ];

  for (const mem of memberships) {
    await dbRun(
      'INSERT INTO group_memberships (group_id, user_id, joined_at, left_at) VALUES (?, ?, ?, ?)',
      [groupId, userIds[mem.name], mem.joined, mem.left]
    );
  }

  console.log('Database seeded successfully. Group ID:', groupId);
}
