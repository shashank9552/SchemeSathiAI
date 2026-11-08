import fs from 'node:fs';
import path from 'node:path';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TextCleaner, DocumentPageText } from '../src/ingestion/cleaner.js';
import { DocumentChunker } from '../src/ingestion/chunker.js';

describe('TextCleaner - Scheme URLs and Spacing Normalization Tests', () => {
  it('preserves scheme-specific URLs and does not strip them', () => {
    const rawPage: DocumentPageText = {
      pageNumber: 10,
      rawText: 'How to apply:\n• Through MLIs (Banks/NBFCs).\n• For detailed guidelines, please visit - https://www.cgtmse.in.',
      lines: [
        'How to apply:',
        '• Through MLIs (Banks/NBFCs).',
        '• For detailed guidelines, please visit - https://www.cgtmse.in.',
      ],
    };

    const cleaned = TextCleaner.cleanPageText(rawPage, new Set());
    assert.match(cleaned, /https:\/\/www\.cgtmse\.in/);
    assert.doesNotMatch(cleaned, /please visit - $/);
  });

  it('strips repeating booklet footer containing www.msme.gov.in', () => {
    const rawPage: DocumentPageText = {
      pageNumber: 6,
      rawText: 'Objective:\nTo create self-employment.\nMSME SCHEMES For more information and regular updates, visit: www.msme.gov.in 04',
      lines: [
        'Objective:',
        'To create self-employment.',
        'MSME SCHEMES For more information and regular updates, visit: www.msme.gov.in 04',
      ],
    };

    const cleaned = TextCleaner.cleanPageText(rawPage, new Set());
    assert.match(cleaned, /To create self-employment/);
    assert.doesNotMatch(cleaned, /www\.msme\.gov\.in/);
    assert.doesNotMatch(cleaned, /MSME SCHEMES/);
  });

  it('normalizes URL domain spacing glitches without touching prose with "etc. in"', () => {
    const urlInput = 'Visit https://innovative. msme. gov. in for more information.';
    const proseInput = 'drainage, power distribution etc. in new/existing industrial areas.';

    assert.strictEqual(
      TextCleaner.normalizeSpacingGlitches(urlInput),
      'Visit https://innovative.msme.gov.in for more information.'
    );
    assert.strictEqual(
      TextCleaner.normalizeSpacingGlitches(proseInput),
      'drainage, power distribution etc. in new/existing industrial areas.'
    );
  });

  it('rejoins split URLs across line breaks (ends in _, -, /, or partial extension)', () => {
    const rawPage25: DocumentPageText = {
      pageNumber: 25,
      rawText: 'https://msme.gov.in/sites/default/files/RevisedICScheme2021.P\nDF',
      lines: [
        'For more detailed information refer to Scheme guidelines, on the following link:',
        'https://msme.gov.in/sites/default/files/RevisedICScheme2021.P',
        'DF',
        'How to apply:',
      ],
    };
    const cleaned25 = TextCleaner.cleanPageText(rawPage25, new Set());
    assert.match(cleaned25, /https:\/\/msme\.gov\.in\/sites\/default\/files\/RevisedICScheme2021\.PDF/);

    const rawPage39: DocumentPageText = {
      pageNumber: 39,
      rawText: '• https://www.dcmsme.gov.in/CLCS_TUS_Scheme/Tool_\nRoom_Tech_Institutions/Scheme_Guidelines.aspx or',
      lines: [
        'How to apply:',
        '• https://www.dcmsme.gov.in/CLCS_TUS_Scheme/Tool_',
        'Room_Tech_Institutions/Scheme_Guidelines.aspx or',
        'website of concerned Tool Room and Technical.',
      ],
    };
    const cleaned39 = TextCleaner.cleanPageText(rawPage39, new Set());
    assert.match(cleaned39, /https:\/\/www\.dcmsme\.gov\.in\/CLCS_TUS_Scheme\/Tool_Room_Tech_Institutions\/Scheme_Guidelines\.aspx/);
  });

  it('preserves complete visit URL for NVCFL on Page 51', () => {
    const rawPage51: DocumentPageText = {
      pageNumber: 51,
      rawText: 'For complete details visit www.nvcfl.co.in',
      lines: ['For complete details visit www.nvcfl.co.in'],
    };
    const cleaned51 = TextCleaner.cleanPageText(rawPage51, new Set());
    assert.match(cleaned51, /For complete details visit www\.nvcfl\.co\.in/);
  });

  it('sentence splitter does not split at abbreviations like Rs., No., Dr., i.e.', () => {
    const chunker = new DocumentChunker(800, 120);
    // Construct long paragraphs (>800 chars) containing abbreviation test strings
    const testCases = [
      'Rs. 50 Lakh',
      'Rs. 5 crore',
      'No. 12',
      'i.e. 10%',
      'Dr. Sharma',
      'Rs.\n5 crore'
    ];

    for (const phrase of testCases) {
      // Pad to >800 chars to force sentence boundary splitting
      const longText = `This is a comprehensive regulatory provision. The beneficiary shall receive ${phrase} under the approved scheme guidelines. ` +
        'Additional criteria apply for all participants across the state jurisdiction. '.repeat(10);
      
      const chunks = chunker.chunkText(longText, 800, 120);
      for (const chunk of chunks) {
        // Assert no chunk ends with Rs. or No.
        assert.ok(!/\b(?:Rs|No)\.$/.test(chunk.trim()), `Chunk must not end with abbreviation: "${chunk.slice(-15)}"`);
        // Assert the phrase itself was not severed across chunks
        const cleanPhrase = phrase.replace(/\s+/g, ' ');
        const phrasePresent = chunks.some(c => c.includes(cleanPhrase) || c.includes(phrase));
        assert.ok(phrasePresent, `Test phrase "${phrase}" must remain intact within a chunk`);
      }
    }
  });

  it('all natural-questions.json expectedScheme entries match outline indexed scheme names', () => {
    let rootDir = path.resolve(process.cwd());
    if (!fs.existsSync(path.resolve(rootDir, 'data')) && fs.existsSync(path.resolve(rootDir, '..', 'data'))) {
      rootDir = path.resolve(rootDir, '..');
    }
    const outlinePath = path.resolve(rootDir, 'data/outlines/MSMESchemebooklet2025-26.json');
    const nqPath = path.resolve(rootDir, 'scripts/eval/natural-questions.json');

    const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));
    const indexedSchemeNames = new Set<string>(
      outline.filter((x: any) => x.index !== false).map((x: any) => x.schemeName)
    );

    const nq = JSON.parse(fs.readFileSync(nqPath, 'utf8'));
    let verifiedCount = 0;

    for (const q of nq) {
      if (q.expectedScheme) {
        assert.ok(
          indexedSchemeNames.has(q.expectedScheme),
          `Question ${q.id} expectedScheme "${q.expectedScheme}" is not in outline indexed scheme names: [${Array.from(indexedSchemeNames).join(', ')}]`
        );
        verifiedCount++;
      }
    }

    assert.equal(verifiedCount, 21, 'Must verify all 21 answerable questions have valid outline scheme names');
  });
});
