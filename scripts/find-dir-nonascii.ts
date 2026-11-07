import fs from 'node:fs';

const c190 = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
console.log('Total chunks in refined_chunks_190.json:', c190.length);

// Let's check chunks on page 56-59
const dirChunks = c190.filter((c: any) => c.pageNumber >= 56 && c.pageNumber <= 59);
console.log(`Directory chunks (pages 56-59): ${dirChunks.length}`);

dirChunks.forEach((c: any, i: number) => {
  // Check for any non-ascii characters
  const nonAscii: Array<{ ch: string; code: string }> = [];
  for (let idx = 0; idx < c.text.length; idx++) {
    const code = c.text.charCodeAt(idx);
    if (code > 127) {
      nonAscii.push({ ch: c.text[idx], code: 'U+' + code.toString(16).toUpperCase() });
    }
  }
  if (nonAscii.length > 0) {
    console.log(`\nDir chunk [${i}] page ${c.pageNumber}:`);
    console.log(`Non-ascii:`, nonAscii);
    console.log(`Snippet: ${c.text.slice(0, 100)}...`);
  }
});
