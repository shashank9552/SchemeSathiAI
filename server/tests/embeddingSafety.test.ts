import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmbeddingsForStorage } from '../src/ingestion/indexer.js';

describe('Embedding Safety Validation Tests (validateEmbeddingsForStorage)', () => {
  function makeValidVector(seed: number, dim = 768): number[] {
    const vec = new Array(dim);
    for (let i = 0; i < dim; i++) {
      vec[i] = Math.sin(seed + i * 0.01) * 0.5 + 0.1;
    }
    return vec;
  }

  it('passes when all vectors are valid, finite, 768-dim, non-zero and distinct', () => {
    const docs = [
      { text: 'chunk 1', embedding: makeValidVector(1) },
      { text: 'chunk 2', embedding: makeValidVector(2) },
      { text: 'chunk 3', embedding: makeValidVector(3) },
    ];

    assert.doesNotThrow(() => {
      validateEmbeddingsForStorage(docs, 768);
    });
  });

  it('fails when docs array is empty', () => {
    assert.throws(
      () => validateEmbeddingsForStorage([], 768),
      /docs array is empty/
    );
  });

  it('fails when vector length is not 768', () => {
    const docs = [
      { text: 'chunk 1', embedding: makeValidVector(1, 512) }, // 512 != 768
    ];

    assert.throws(
      () => validateEmbeddingsForStorage(docs, 768),
      /expected vector length 768, got 512/
    );
  });

  it('fails when vector contains NaN or Infinity', () => {
    const vecWithNaN = makeValidVector(1);
    vecWithNaN[42] = NaN;

    const vecWithInf = makeValidVector(2);
    vecWithInf[100] = Infinity;

    assert.throws(
      () => validateEmbeddingsForStorage([{ text: 'chunk 1', embedding: vecWithNaN }], 768),
      /vector contains non-finite value \(NaN\) at dimension 42/
    );

    assert.throws(
      () => validateEmbeddingsForStorage([{ text: 'chunk 2', embedding: vecWithInf }], 768),
      /vector contains non-finite value \(Infinity\) at dimension 100/
    );
  });

  it('fails when vector is all zeros (placeholder/mock vector)', () => {
    const zeroVec = new Array(768).fill(0);
    const docs = [
      { text: 'chunk 1', embedding: makeValidVector(1) },
      { text: 'chunk 2 (placeholder)', embedding: zeroVec },
    ];

    assert.throws(
      () => validateEmbeddingsForStorage(docs, 768),
      /placeholder\/all-zero vector detected/
    );
  });

  it('fails when a chunk vector is identical to another chunk vector in the batch', () => {
    const vec1 = makeValidVector(10);
    const vec2Duplicate = [...vec1]; // exact duplicate

    const docs = [
      { text: 'chunk 1', embedding: vec1 },
      { text: 'chunk 2', embedding: makeValidVector(20) },
      { text: 'chunk 3 (dup of 1)', embedding: vec2Duplicate },
    ];

    assert.throws(
      () => validateEmbeddingsForStorage(docs, 768),
      /has identical vector to chunk index 0/
    );
  });
});
