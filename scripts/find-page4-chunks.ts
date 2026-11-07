import fs from 'node:fs';
import path from 'node:path';

function checkJson(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const chunks = Array.isArray(data) ? data : (data.chunks || []);
  console.log(`Checking ${filePath} (${chunks.length} chunks)...`);
  for (const c of chunks) {
    if (c.pageNumber === 4 || c.metadata?.pageNumber === 4) {
      console.log(`  Page 4 chunk: id=${c._id || c.id}, scheme=${c.schemeName || c.metadata?.schemeName}`);
      console.log(`  text: ${(c.text || '').slice(0, 150)}...\n`);
    }
    if ((c.text || '').toLowerCase().includes('vibrant')) {
      console.log(`  Vibrant chunk in ${filePath}: page=${c.pageNumber || c.metadata?.pageNumber}`);
      console.log(`  text: ${(c.text || '').slice(0, 150)}...\n`);
    }
  }
}

checkJson('data/processed/refined_chunks_190.json');
checkJson('data/backup-verified-chunks/refined_chunks_190.json');
checkJson('data/backup-verified-chunks/refined_chunks_191.json');
