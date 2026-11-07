import { DocumentChunker } from '../server/src/ingestion/chunker.js';
import fs from 'node:fs';

const pagesData = JSON.parse(fs.readFileSync('scripts/investigation-pages-48-54.json', 'utf8'));

const pages = [49, 50, 51, 52].map(p => ({
  pageNumber: p,
  text: pagesData.find((x: any) => x.pageNumber === p).rawText,
}));

const chunker = new DocumentChunker();
const docInfo = {
  sourceFile: 'MSMESchemebooklet2025-26.pdf',
  documentTitle: 'Ministry of MSME Scheme Booklet 2025-26',
  defaultSchemeName: '3) MSME COMPETITIVE (LEAN) SCHEME',
  category: 'Business, MSME & Entrepreneurship',
  level: 'central' as const,
  language: 'en',
};

const chunks = chunker.chunkDocument(pages, docInfo);
console.log('Total chunks:', chunks.length);
for (const c of chunks) {
  console.log(`Page ${c.metadata.pageNumber} | Scheme: "${c.metadata.schemeName}" | Section: "${c.metadata.sectionTitle}"`);
}
