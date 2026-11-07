import fs from 'node:fs';

const chunks = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
const targetPages = [10, 14, 16, 19, 22, 25, 29, 34, 39, 43, 45, 46, 47, 48, 51];

for (const p of targetPages) {
  const pChunks = chunks.filter((c: any) => c.pageNumber === p);
  console.log(`Page ${p}: ${pChunks.length} chunks`);
  pChunks.forEach((c: any) => {
    console.log(`  idx: ${c.chunkIndex} | scheme: "${c.schemeName}" | sec: "${c.sectionTitle}" | text: ${JSON.stringify(c.text.slice(0, 60))}`);
  });
}
