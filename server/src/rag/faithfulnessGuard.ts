/**
 * SchemeSathi — Faithfulness Guard
 * 
 * Verifies that every number and percentage claimed in the LLM-generated answer
 * is explicitly grounded in the text of the cited chunks.
 * Prevents numerical hallucinations (e.g. fabricated subsidy percentages,
 * loan limits, or interest rates).
 */

export interface FaithfulnessCheckResult {
  faithful: boolean;
  ungroundedNumbers: string[];
}

export class FaithfulnessGuard {
  /**
   * Convert Devanagari numerals to ASCII digits (०-९ -> 0-9)
   */
  private static toAsciiDigits(text: string): string {
    const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    let result = text;
    for (let i = 0; i < 10; i++) {
      result = result.replaceAll(devanagariDigits[i], String(i));
    }
    return result;
  }

  /**
   * Extract all factual numbers and percentages from the answer text,
   * intentionally ignoring structural list numbering (e.g., "1. ", "2. ")
   * and citation references (e.g., "[1]", "[chunk-0]").
   */
  public static extractNumbersAndPercentages(text: string): string[] {
    const asciiText = this.toAsciiDigits(text);

    // Strip structural list prefixes at start of lines: "1. ", "2. ", "1) ", etc.
    const strippedStructural = asciiText
      .replace(/(?:^|\n)\s*\d+[\.\)]\s+/g, '\n')
      .replace(/\[\s*(?:chunk-)?\d+\s*\]/gi, '');

    // Match numbers with optional decimal and optional percent sign (e.g., "15%", "1.00", "50", "25")
    const matches = strippedStructural.match(/\b\d+(?:\.\d+)?%?/g) || [];

    // Filter out obvious years like 2024, 2025, 2026 or empty tokens
    const uniqueTokens = Array.from(new Set(matches.map((m) => m.trim()))).filter((m) => {
      // Keep percentages and numbers
      return m.length > 0;
    });

    return uniqueTokens;
  }

  /**
   * Verifies that every extracted number and percentage from the answer
   * is present in the concatenated text of the used chunks.
   */
  public static verifyFaithfulness(answerText: string, chunkTexts: string[]): FaithfulnessCheckResult {
    const extracted = this.extractNumbersAndPercentages(answerText);
    if (extracted.length === 0) {
      return { faithful: true, ungroundedNumbers: [] };
    }

    const combinedChunksAscii = this.toAsciiDigits(chunkTexts.join(' ')).toLowerCase();
    const ungroundedNumbers: string[] = [];

    for (const token of extracted) {
      const isPercent = token.endsWith('%');
      const numericVal = isPercent ? token.slice(0, -1) : token;

      if (isPercent) {
        // Look for "15%", "15 %", "15 percent", or "15 प्रतिशत" in chunks
        const percentRegex = new RegExp(`(?:\\b|[^0-9.])${numericVal}\\s*(?:%|percent|प्रतिशत)`, 'i');
        if (!percentRegex.test(combinedChunksAscii)) {
          ungroundedNumbers.push(token);
        }
      } else {
        // Look for standalone number token (e.g., "18", "50", "1.00")
        const numberRegex = new RegExp(`(?:\\b|[^0-9.])${numericVal}(?:\\b|[^0-9.])`, 'i');
        if (!numberRegex.test(combinedChunksAscii)) {
          ungroundedNumbers.push(token);
        }
      }
    }

    return {
      faithful: ungroundedNumbers.length === 0,
      ungroundedNumbers,
    };
  }
}
