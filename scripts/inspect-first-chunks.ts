import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('data/processed/chunks_MSMESchemebooklet2025-26.json', 'utf8'));
console.log('Total chunks:', raw.length);
for (let i = 0; i < 15; i++) {
  const c = raw[i];
  console.log(`[${i}] Page: ${c.pageNumber} | Scheme: "${c.schemeName}" | Section: "${c.sectionTitle}"`);
}
