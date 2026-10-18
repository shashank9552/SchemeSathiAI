import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FaithfulnessGuard } from '../src/rag/faithfulnessGuard.js';

test('FaithfulnessGuard - detects grounded numbers and percentages', () => {
  const answer = 'Eligible applicants receive a 90% guarantee coverage for loans up to 50 lakh.';
  const chunkText = ['The guarantee coverage is 90% for loans up to 50 lakh for women entrepreneurs.'];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true);
  assert.equal(result.ungroundedNumbers.length, 0);
});

test('FaithfulnessGuard - detects ungrounded numbers and percentages (ANS-10 scenario)', () => {
  const answer = 'General category gets 15% in urban and 25% in rural areas for projects up to 50 lakh.';
  // Page 5 chunk only mentions Special category gets 35% in rural areas and 25% in urban areas
  const chunkText = [
    'For beneficiaries belonging to Special categories the margin money subsidy is 35% in rural areas and 25% in urban areas. Any individual above 18 years of age can apply. Own contribution is 10% for General and 5% for Special.',
  ];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, false);
  // "15%" and "50" do not appear in this chunk!
  assert.ok(result.ungroundedNumbers.includes('15%'));
  assert.ok(result.ungroundedNumbers.includes('50'));
});

test('FaithfulnessGuard - ignores list numbering prefixes like "1. ", "2. "', () => {
  const answer = `
1. Any individual above 18 years can apply.
2. Beneficiary contribution is 10%.
`;
  const chunkText = ['Any individual above 18 years of age can apply. Own contribution is 10% for General.'];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true);
  assert.equal(result.ungroundedNumbers.length, 0);
});
