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

test('FaithfulnessGuard - flags ungrounded_number on old ANS-10 answer with Page 5 chunks', () => {
  // Old ANS-10 answer that hallucinated general category 15% urban / 25% rural subsidy:
  const oldAns10Answer = `
18 वर्ष से अधिक आयु का कोई भी व्यक्ति PMEGP योजना के तहत आवेदन कर सकता है।
1. स्वयं का अंशदान: सामान्य श्रेणी के लिए 10% और विशेष श्रेणी के लिए 5% है।
2. सब्सिडी: सामान्य श्रेणी के लाभार्थियों को शहरी क्षेत्र में 15% और ग्रामीण क्षेत्र में 25% सब्सिडी मिलती है। विशेष श्रेणी के लाभार्थियों को शहरी क्षेत्र में 25% और ग्रामीण क्षेत्र में 35% तक सब्सिडी दी जाती है।
`;

  // Real Page 5 chunks from the booklet:
  const page5Chunks = [
    `Prime Minister’s Employment Generation Programme (PMEGP) - Scheme applicable for (Eligibility)
• For beneficiaries belonging to Special categories such as SC/ST/ Women/ Minorities/ Ex-Servicemen/ Transgenders/ Aspirational districts/NER, the margin money subsidy is 35% in rural areas and 25% in urban areas. Scheme applicable for:
• Any individual, above 18 years of age can apply. Detailed Information:
• The own contribution of the beneficiary is 10% of the project cost in case of General category and 5% of the project cost in case of Special category (SC/ST/OBC/PH/Women/Ex Servicemen/Transgenders/Aspirational Districts/NER) beneficiaries.`,
    `Prime Minister’s Employment Generation Programme (PMEGP) - How to apply
• Online application form is mandatory for individuals on the e-portal. The application form/PMEGP MIS portal is mobile friendly.`,
  ];

  const result = FaithfulnessGuard.verifyFaithfulness(oldAns10Answer, page5Chunks);
  assert.equal(result.faithful, false, 'Must flag ungrounded numbers in old ANS-10 answer');
  // "15%" does NOT appear anywhere in the cited chunks!
  assert.ok(result.ungroundedNumbers.includes('15%'), 'Must detect ungrounded 15%');
});

test('FaithfulnessGuard - accepts number-format variants (Rs. 1.00 crore vs 1 crore)', () => {
  const answer = 'The maximum project cost under the manufacturing sector is 1 crore.';
  const chunkText = [
    'The maximum cost of the project under manufacturing sector for up-gradation is Rs.1.00 crore and Rs. 25.00 lakh for service sector.',
  ];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true, '1 crore must match Rs.1.00 crore');
  assert.equal(result.ungroundedNumbers.length, 0);
});

test('FaithfulnessGuard - accepts reverse decimal variant (1.00 crore in answer vs 1 crore in chunk)', () => {
  const answer = 'The maximum project cost is 1.00 crore.';
  const chunkText = ['The maximum cost of the project is 1 crore.'];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true, '1.00 crore must match 1 crore');
  assert.equal(result.ungroundedNumbers.length, 0);
});

test('FaithfulnessGuard - accepts language variants (50 lakh vs 50 लाख)', () => {
  const answer = 'सूक्ष्म उद्यमों के लिए अधिकतम ऋण 50 लाख रुपये तक हो सकता है।';
  const chunkText = [
    'Margin Money subsidy ranges from 15% to 35% of project cost for projects up to Rs. 50 Lakh in Manufacturing sector.',
  ];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true, '50 लाख must match 50 Lakh');
  assert.equal(result.ungroundedNumbers.length, 0);
});

test('FaithfulnessGuard - accepts Devanagari numerals (५० लाख and ९०% and १८ वर्ष)', () => {
  const answer = '१८ वर्ष से अधिक आयु के आवेदक को ५० लाख तक के ऋण पर ९०% गारंटी सुरक्षा दी जाती है।';
  const chunkText = [
    'Any individual above 18 years of age can apply. Credit guarantee of 90% is available for loans up to 50 lakh.',
  ];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true, 'Devanagari numerals (१८, ५०, ९०%) must match ASCII (18, 50, 90%)');
  assert.equal(result.ungroundedNumbers.length, 0);
});

test('FaithfulnessGuard - accepts percentage in Hindi words (90 प्रतिशत vs 90%)', () => {
  const answer = 'महिला उद्यमियों को 90 प्रतिशत ऋण गारंटी प्रदान की जाती है।';
  const chunkText = ['The extent of guarantee coverage is 90% for women entrepreneurs.'];

  const result = FaithfulnessGuard.verifyFaithfulness(answer, chunkText);
  assert.equal(result.faithful, true, '90 प्रतिशत must match 90%');
  assert.equal(result.ungroundedNumbers.length, 0);
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
