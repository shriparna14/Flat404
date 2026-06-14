import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, dbAll } from './database.js';
import { analyzeCSV } from './importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await initDatabase();
  const csvPath = path.join(__dirname, 'expenses_export.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const result = await analyzeCSV(csvContent);
  
  result.rows.forEach(r => {
    if (r.anomalies.length > 0) {
      console.log(`Line ${r.lineNo}: ${r.description}`);
      r.anomalies.forEach(a => {
        console.log(`  - [${a.type}] ${a.message}`);
      });
    }
  });
}

main();
