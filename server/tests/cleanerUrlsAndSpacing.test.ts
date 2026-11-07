import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TextCleaner, DocumentPageText } from '../src/ingestion/cleaner.js';

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

  it('normalizes multi-part date spacing glitches', () => {
    const input = 'The Ministry on 20. 09. 2022 has signed MoUs with 18 Export Promotion Councils.';
    const normalized = TextCleaner.normalizeSpacingGlitches(input);
    assert.strictEqual(
      normalized,
      'The Ministry on 20.09.2022 has signed MoUs with 18 Export Promotion Councils.'
    );
  });

  it('normalizes decimal spacing glitches across space and newlines', () => {
    const input1 = 'grant support: Upto Rs. 1. 00 lakh.';
    const input2 = 'grant support: Upto Rs. 1.\n00 lakh.';
    assert.strictEqual(TextCleaner.normalizeSpacingGlitches(input1), 'grant support: Upto Rs. 1.00 lakh.');
    assert.strictEqual(TextCleaner.normalizeSpacingGlitches(input2), 'grant support: Upto Rs. 1.00 lakh.');
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
});
