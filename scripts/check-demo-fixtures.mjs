import { readFile } from 'node:fs/promises';

const files = ['index.html', 'initial-data.json', 'supabase/seed/demo-state.json'];
const forbidden = ["'S01'", '"S01"', 'LCW', '2026-08-21', '2026-10-08', 'HJ (同學)', '潔 (同學)'];
let failed = 0;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const hits = forbidden.filter(value => text.includes(value));
  if (hits.length) {
    console.log(`✗ ${file}: contains ${hits.join(', ')}`);
    failed++;
  } else console.log(`✓ ${file}: no known research fixture markers`);
}
if (failed) process.exit(1);
