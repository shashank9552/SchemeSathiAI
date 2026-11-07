import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('data/processed/chunks_MSMESchemebooklet2025-26.json', 'utf8'));
const map = new Map<number, Set<string>>();
for (const c of raw) {
  if (!map.has(c.pageNumber)) map.set(c.pageNumber, new Set());
  map.get(c.pageNumber)!.add(c.schemeName);
}

for (const [p, s] of map.entries()) {
  console.log(`Page ${p}: ${Array.from(s).join(' | ')}`);
}
