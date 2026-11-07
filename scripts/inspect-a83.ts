import fs from 'node:fs';

const chunks = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
// Find the chunk on page 57 with chunkIndex or text
const c = chunks.find((x: any) => x.pageNumber === 57 && x.text.includes('Jaipur -302 006'));
if (c) {
  console.log('Found chunk on page 57:');
  console.log('Full Text:\n', c.text);
  // Find non-ASCII and non-Devanagari characters:
  const foreignChars = c.text.match(/[^\u0000-\u007F\u0900-\u097F\u2000-\u206F\u20A0-\u20CF\s]/g) || [];
  console.log('Foreign characters found:', foreignChars);
  foreignChars.forEach((ch: string) => {
    console.log(`Char "${ch}" -> code point U+${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  });
} else {
  console.log('Chunk not found');
}
