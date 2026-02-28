/**
 * Chunk text into overlapping segments for embedding.
 */
export type ChunkOptions = {
  maxChunkSize?: number;
  overlap?: number;
};

export type TextChunk = {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
};

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChunkSize = options.maxChunkSize ?? 500;
  const overlap = options.overlap ?? 50;

  if (!text || text.trim().length === 0) return [];

  const cleanText = text.trim();
  if (cleanText.length <= maxChunkSize) {
    return [{ text: cleanText, index: 0, startChar: 0, endChar: cleanText.length }];
  }

  const chunks: TextChunk[] = [];
  let startChar = 0;
  let index = 0;

  while (startChar < cleanText.length) {
    let endChar = Math.min(startChar + maxChunkSize, cleanText.length);

    // Try to break at sentence boundary
    if (endChar < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf('.', endChar);
      const lastNewline = cleanText.lastIndexOf('\n', endChar);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > startChar + maxChunkSize * 0.5) {
        endChar = breakPoint + 1;
      }
    }

    chunks.push({
      text: cleanText.slice(startChar, endChar).trim(),
      index,
      startChar,
      endChar,
    });

    // If we've reached the end, stop
    if (endChar >= cleanText.length) break;

    startChar = endChar - overlap;
    if (startChar >= cleanText.length) break;
    index++;
  }

  return chunks;
}
