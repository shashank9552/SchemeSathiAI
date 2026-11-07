import fs from 'node:fs';

const nq = JSON.parse(fs.readFileSync('scripts/eval/natural-questions.json', 'utf8'));
console.log(`Loaded ${nq.length} questions.`);
for (const q of nq) {
  const str = JSON.stringify(q);
  if (str.toLowerCase().includes('vibrant') || str.toLowerCase().includes('dynamic') || str.toLowerCase().includes('sector')) {
    console.log(`Question: ${q.id} | ${q.question}`);
    if (q.expectedPhrase) console.log(`  expectedPhrase: ${q.expectedPhrase}`);
    if (q.expectedPage) console.log(`  expectedPage: ${q.expectedPage}`);
  }
}
