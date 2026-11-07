import fs from 'node:fs';

const chunks = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
const c22 = chunks.filter((c: any) => c.pageNumber === 22);
console.log('Total chunks on page 22:', c22.length);
c22.forEach((c: any, i: number) => {
  console.log(`[P22 Chunk ${i}] sectionTitle: "${c.sectionTitle}"`);
  console.log(`Text:\n${c.text}\n`);
});
