import { describe, it, expect } from 'vitest';
import { chunkText } from '../rag-chunker.js';

describe('RAG Chunker', () => {
  it('returns empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello world', { maxChunkSize: 500 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello world');
    expect(chunks[0].index).toBe(0);
  });

  it('splits long text into overlapping chunks', () => {
    const text = 'A'.repeat(200) + '. ' + 'B'.repeat(200) + '. ' + 'C'.repeat(200);
    const chunks = chunkText(text, { maxChunkSize: 250, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    // Verify overlap exists
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startChar).toBeLessThan(chunks[i - 1].endChar);
    }
  });

  it('respects maxChunkSize', () => {
    const text = 'Word '.repeat(200);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 10 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(110); // some tolerance for sentence breaking
    }
  });

  it('assigns sequential indices', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. '.repeat(10);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it('uses default options', () => {
    const text = 'Short text';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
  });
});
