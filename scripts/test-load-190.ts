import fs from 'node:fs';

const chunks = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
console.log('Total chunks in refined_chunks_190.json:', chunks.length);
console.log('Sample chunk keys:', Object.keys(chunks[0]));
console.log('First chunk _id:', chunks[0]._id);
console.log('Last chunk _id:', chunks[chunks.length - 1]._id);
