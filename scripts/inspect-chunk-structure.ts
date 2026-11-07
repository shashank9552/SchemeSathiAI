import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
for (let i = 0; i < 5; i++) {
  const c = data[i];
  console.log(`--- CHUNK ${i} ---`);
  console.log(`pageNumber: ${c.pageNumber}`);
  console.log(`schemeName: ${c.schemeName}`);
  console.log(`sectionTitle: ${c.sectionTitle}`);
  console.log(`text:\n${c.text}\n`);
}
