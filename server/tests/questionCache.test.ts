import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuestionCache } from '../src/rag/questionCache.js';
import { ChatResponse } from '../src/rag/types.js';

test('QuestionCache - never caches responses with reason=llm_error', () => {
  const cache = new QuestionCache(60000, 100);

  const errorResponse: ChatResponse = {
    answer: 'Something went wrong, please try again.',
    citations: [],
    latencyMs: 120,
    answerable: false,
    reason: 'llm_error',
  };

  cache.set('en', 'How to apply for PMEGP loan?', errorResponse);
  const cached = cache.get('en', 'How to apply for PMEGP loan?');

  assert.equal(cached, null, 'Cache must not store llm_error responses');
  assert.equal(cache.size(), 0, 'Cache size must remain 0');

  cache.destroy();
});

test('QuestionCache - never caches responses with reason=quota_error', () => {
  const cache = new QuestionCache(60000, 100);

  const quotaResponse: ChatResponse = {
    answer: 'High traffic. Please try again shortly.',
    citations: [],
    latencyMs: 80,
    answerable: false,
    reason: 'quota_error',
  };

  cache.set('en', 'What is CGTMSE scheme?', quotaResponse);
  const cached = cache.get('en', 'What is CGTMSE scheme?');

  assert.equal(cached, null, 'Cache must not store quota_error responses');
  assert.equal(cache.size(), 0, 'Cache size must remain 0');

  cache.destroy();
});

test('QuestionCache - caches legitimate responses (answerable, below_threshold, etc.)', () => {
  const cache = new QuestionCache(60000, 100);

  const validResponse: ChatResponse = {
    answer: 'PMEGP provides financial assistance for setting up new enterprises.',
    citations: [
      {
        schemeName: 'PMEGP',
        sourceFile: 'booklet.pdf',
        pageNumber: 5,
        sectionTitle: 'Eligibility',
        excerpt: 'Any individual above 18 years can apply...',
      },
    ],
    latencyMs: 450,
    answerable: true,
    topScore: 0.88,
  };

  cache.set('en', 'How to apply for PMEGP loan?', validResponse);
  const cached = cache.get('en', 'How to apply for PMEGP loan?');

  assert.notEqual(cached, null);
  assert.equal(cached?.answerable, true);
  assert.equal(cached?.topScore, 0.88);
  assert.equal(cache.size(), 1);

  cache.destroy();
});
