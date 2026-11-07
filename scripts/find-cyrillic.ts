import fs from 'node:fs';

for (const f of ['data/processed/refined_chunks_191.json', 'data/processed/chunks_MSMESchemebooklet2025-26.json']) {
  if (fs.existsSync(f)) {
    const chunks = JSON.parse(fs.readFileSync(f, 'utf8'));
    const cyrillicRegex = /[\u0400-\u04FF]/g;
    chunks.forEach((c: any, idx: number) => {
      const matches = c.text.match(cyrillicRegex);
      if (matches) {
        console.log(`File ${f} | Chunk idx ${idx} (page ${c.pageNumber}) has Cyrillic:`, matches);
        const pos = c.text.search(cyrillicRegex);
        console.log(`Snippet: "${c.text.slice(Math.max(0, pos - 40), Math.min(c.text.length, pos + 50))}"`);
      }
    });
  }
}
