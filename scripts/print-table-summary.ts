import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scripts/page-by-page-dry-run.json', 'utf8'));
console.log(`Total Old: ${data.totalOld} | Total New: ${data.totalNew} | Total Hits: ${data.totalHits} | Total New: ${data.totalNewEmbeds}\n`);

console.log('| Page | Old Atlas Label | New Scheme | New Sections | Chunks (Old -> New) | Hits | New Embeds | Difference Reason |');
console.log('| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |');

for (const r of data.tableRows) {
  const oldLbl = r.oldLabels.length > 0 ? r.oldLabels.join(', ') : '(None)';
  const newSec = r.newSections.length > 0 ? r.newSections.slice(0, 2).join(', ') : '(None)';
  console.log(`| P${r.page} | ${oldLbl.slice(0, 30)} | ${r.newScheme.slice(0, 30)} | ${newSec.slice(0, 25)} | ${r.oldCount} -> ${r.newCount} | ${r.cacheHits} | ${r.newEmbeddings} | ${r.differenceReason} |`);
}
