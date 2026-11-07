import fs from 'node:fs';
import path from 'node:path';

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  subCategory?: string;
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

// In MSMESchemebooklet2025-26.pdf:
// For pages 3 to 53, Printed Page = PDF Page - 2 (or PDF Page = Printed Page + 2).
// In MongoDB Atlas chunks, pageNumber is the 1-based PDF Page Index (1..61).

async function main() {
  const filePath = path.resolve('scripts/eval/natural-questions.json');
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const chunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));

  console.log('=== VERIFYING AND CORRECTING EXPECTED PAGES IN natural-questions.json ===\n');

  for (const q of questions) {
    if (q.category !== 'answerable' || !q.expectedPhrase) continue;

    // Search in chunks for expected phrase
    const match = chunks.find(c => c.text && c.text.toLowerCase().includes(q.expectedPhrase!.toLowerCase()));
    
    // Also search by scheme if phrase is not found
    const schemeChunks = chunks.filter(c => q.expectedScheme && c.schemeName && c.schemeName.toLowerCase().includes(q.expectedScheme.toLowerCase()));
    const schemePages = Array.from(new Set(schemeChunks.map(c => c.pageNumber))).sort((a,b) => a-b);

    console.log(`[${q.id}] current expectedPage: ${q.expectedPage} | phrase: "${q.expectedPhrase}"`);
    if (match) {
      console.log(`  -> Found in chunks at PDF pageNumber: ${match.pageNumber} (Printed Footer: "${match.pageNumber - 2}")`);
      if (q.expectedPage !== match.pageNumber) {
        console.log(`  -> UPDATING expectedPage from ${q.expectedPage} to ${match.pageNumber}`);
        q.expectedPage = match.pageNumber;
      }
    } else {
      console.log(`  -> Phrase NOT found in chunks! Scheme chunks are on PDF page(s): [${schemePages.join(', ')}]`);
    }
  }

  // Write updated questions
  fs.writeFileSync(filePath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
  console.log(`\nUpdated ${filePath} successfully.`);
}

main().catch(console.error);
