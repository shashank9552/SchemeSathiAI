import fs from 'node:fs';

const pagesData = JSON.parse(fs.readFileSync('scripts/investigation-pages-48-54.json', 'utf8'));

for (const p of [49, 50, 51, 52]) {
  const pageObj = pagesData.find((x: any) => x.pageNumber === p);
  const lines: string[] = pageObj.lines;
  console.log(`================================================================================`);
  console.log(`PDF PAGE ${p} (Printed Footer Page: ${p - 2}) - Total Lines: ${lines.length}`);
  console.log(`================================================================================`);
  
  console.log(`--- FIRST 10 LINES ---`);
  lines.slice(0, 10).forEach((l, i) => console.log(`  [L${i + 1}] ${l}`));

  console.log(`\n--- LAST 10 LINES ---`);
  const last10Start = Math.max(0, lines.length - 10);
  lines.slice(last10Start).forEach((l, i) => console.log(`  [L${last10Start + i + 1}] ${l}`));

  console.log(`\n--- HEADING / SECTION CANDIDATE LINES ---`);
  lines.forEach((l, i) => {
    if (!l.startsWith('•') && (l === l.toUpperCase() || /^[0-9IVX]+\.|\b(About|Objective|Features|Scheme applicable|How to apply|Detailed Information)\b/i.test(l))) {
      console.log(`  [L${i + 1}] ${l}`);
    }
  });
  console.log('\n');
}
