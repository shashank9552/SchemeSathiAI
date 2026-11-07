import fs from 'node:fs';

const filePath = 'data/processed/chunks_MSMESchemebooklet2025-26.json';
if (fs.existsSync(filePath)) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Checking ${filePath}: total items ${data.length}`);
  for (const item of data) {
    if ((item.text || '').toLowerCase().includes('vibrant')) {
      console.log(`Page: ${item.pageNumber || item.metadata?.pageNumber}, text: ${(item.text || '').slice(0, 150)}`);
    }
    if ((item.text || '').toLowerCase().includes('dynamic')) {
      console.log(`Page: ${item.pageNumber || item.metadata?.pageNumber}, text: ${(item.text || '').slice(0, 150)}`);
    }
  }
} else {
  console.log('File does not exist');
}
