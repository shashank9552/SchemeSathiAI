/**
 * SchemeSathi - Text Cleaner Module
 * 
 * Cleans extracted PDF page text:
 * 1. Strips headers and footers that repeat across pages (e.g. MSME SCHEMES boilerplate, page numbers).
 * 2. Strips publisher URLs (e.g., https://..., www.msme.gov.in).
 * 3. Normalizes whitespace and removes control characters.
 */

export interface DocumentPageText {
  pageNumber: number;
  rawText: string;
  lines: string[];
}

export class TextCleaner {
  /**
   * Identifies repeating lines across multiple pages of a single document
   * that represent running headers or footers.
   */
  public static findRepeatingHeaderFooters(
    pages: DocumentPageText[],
    minOccurrenceRatio = 0.15,
    minOccurrences = 3
  ): Set<string> {
    const lineFrequency = new Map<string, number>();
    const totalPages = pages.length;

    for (const page of pages) {
      // Check top 3 lines (headers) and bottom 3 lines (footers)
      const candidateLines = new Set<string>();
      const topLines = page.lines.slice(0, 3);
      const bottomLines = page.lines.slice(-3);

      for (const line of [...topLines, ...bottomLines]) {
        const normalized = this.normalizeLineForComparison(line);
        // Never treat structural content labels (Objective, Eligibility, etc.) as repeating headers/footers
        if (/^(objective|eligibility|benefits|detailed information|scheme applicable for|who can apply|how to apply|financial assistance|scheme components):?$/i.test(normalized)) {
          continue;
        }
        if (normalized.length > 5) {
          candidateLines.add(normalized);
        }
      }

      for (const norm of candidateLines) {
        lineFrequency.set(norm, (lineFrequency.get(norm) || 0) + 1);
      }
    }

    const repeatingSet = new Set<string>();
    const threshold = Math.max(minOccurrences, Math.ceil(totalPages * minOccurrenceRatio));

    for (const [normLine, count] of lineFrequency.entries()) {
      if (count >= threshold) {
        repeatingSet.add(normLine);
      }
    }

    return repeatingSet;
  }

  /**
   * Normalizes a line for comparison (lowercased, punctuation trimmed, trailing page numbers removed)
   */
  public static normalizeLineForComparison(line: string): string {
    return line
      .toLowerCase()
      .replace(/\b\d+\s*$/, '') // remove trailing page numbers (e.g., "visit: www.msme.gov.in 03" -> "visit: www.msme.gov.in")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Strips publisher URLs from text
   */
  public static stripPublisherUrls(text: string): string {
    // Strips http://, https://, and www. links
    return text
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/\bwww\.[a-z0-9\-]+(\.[a-z0-9\-]+)+[^\s]*/gi, '')
      .replace(/\s{2,}/g, ' ');
  }

  /**
   * Cleans a single page's text using repeating lines blacklist and general cleanup rules
   */
  public static cleanPageText(page: DocumentPageText, repeatingLinesBlacklist: Set<string>): string {
    const cleanedLines: string[] = [];

    for (const line of page.lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 1. Check if line matches repeating header/footer blacklist
      const norm = this.normalizeLineForComparison(trimmed);
      if (repeatingLinesBlacklist.has(norm)) {
        continue;
      }

      // 2. Check for common regex header/footer boilerplate
      if (this.isBoilerplateLine(trimmed)) {
        continue;
      }

      // 3. Strip publisher URLs within the line
      const urlStripped = this.stripPublisherUrls(trimmed);
      if (urlStripped.trim().length > 0) {
        cleanedLines.push(urlStripped.trim());
      }
    }

    // Join cleaned lines and normalize multiple consecutive blank lines
    let cleanedText = cleanedLines
      .join('\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // remove ASCII control characters
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return this.formatStructuredTables(cleanedText);
  }

  /**
   * Formats known tabular structures (e.g. CGTMSE guarantee table) into readable Markdown tables
   */
  public static formatStructuredTables(text: string): string {
    if (text.includes('extent of guarantee coverage under various') && text.includes('Maximum extent of Guarantee Coverage')) {
      const formattedTable = [
        '• The extent of guarantee coverage under various categories of borrower is as under:',
        '',
        '| Category (including Trading activity) | Upto Rs. 5 lakh | Above Rs. 5 lakh & upto Rs. 50 lakh | Above Rs. 50 lakh & upto Rs. 5 crore |',
        '|---|---|---|---|',
        '| Micro Enterprises | 85% | 75% | 75% |',
        '| MSEs located in North East Region, UT of Jammu & Kashmir and UT of Ladakh | 80% | 80% | 75% |',
        '| Women entrepreneurs | 90% | 90% | 85% |',
        '| SC/ST entrepreneurs / MSEs situated in Aspirational District / ZED certified MSEs / Person with Disability (PwD) | 85% | 85% | 85% |',
        '| All other category of borrowers | 75% | 75% | 75% |',
        '',
        'The extent of guarantee coverage for MSEs situated in Identified Credit Deficient Districts (ICDD) by RBI is additional 5% over and above the applicable guarantee coverage (i.e. for guarantee coverage of 75%, the coverage would be 80%, for 80% it would be 85%, for 85% it would be 90% and for 90% it would be 95%).'
      ].join('\n');

      const regex = /• The extent of guarantee coverage under various[\s\S]*?for 90% it would be 95%\)\./;
      text = text.replace(regex, formattedTable);
    }
    return text;
  }

  /**
   * Checks if a line matches typical government/compilation PDF boilerplate
   */
  private static isBoilerplateLine(line: string): boolean {
    const l = line.toLowerCase();

    // Isolated page numbers (e.g. "Page 12", "12 of 65", "- 5 -")
    if (/^(page\s+)?\d+(\s+(of|\/)\s+\d+)?$/i.test(l)) return true;
    if (/^[-–—]\s*\d+\s*[-–—]$/.test(l)) return true;

    // Repeating MSME booklet footer pattern: "MSME SCHEMES For more information and regular updates, visit: ..."
    if (l.includes('msme schemes') && l.includes('for more information')) return true;

    // Coaching / compilation headers
    if (l.startsWith('vision ias') && l.includes('delhi')) return true;
    if (l.includes('all rights reserved')) return true;

    return false;
  }
}
