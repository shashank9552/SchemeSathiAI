import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scripts/run-once-a3-results.json', 'utf8'));
console.log(`Total no-match items: ${data.noMatchList.length}`);
const schemeItems = data.noMatchList.filter((x: any) => x.page < 56);
const dirItems = data.noMatchList.filter((x: any) => x.page >= 56);
console.log(`Scheme items (< 56): ${schemeItems.length}`);
console.log(`Directory items (>= 56): ${dirItems.length}`);

console.log('\n--- SCHEME NO-MATCH CHUNKS ---');
schemeItems.forEach((x: any, idx: number) => {
  console.log(`[${idx + 1}] _id: ${x._id} | Page: ${x.page} | Scheme: "${x.scheme}" | Section: "${x.section}"`);
  console.log(`    First 120: "${x.first120}"\n`);
});
