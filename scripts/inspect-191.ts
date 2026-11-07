import fs from 'node:fs';

const c191 = JSON.parse(fs.readFileSync('data/processed/refined_chunks_191.json', 'utf8'));
const relevant = c191.filter((c: any) => c.pageNumber >= 48 && c.pageNumber <= 54);
for (const c of relevant) {
  console.log(`[Idx ${c.chunkIndex}] Page ${c.pageNumber} | Scheme: "${c.schemeName}" | Section: "${c.sectionTitle}"`);
  console.log(`Text snippet: ${c.text.slice(0, 100).replace(/\n/g, ' ')}...`);
}
