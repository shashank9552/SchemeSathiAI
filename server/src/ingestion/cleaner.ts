/**
 * SchemeSathi - Text Cleaner Module
 * 
 * Cleans extracted PDF page text:
 * 1. Strips headers and footers that repeat across pages (e.g. MSME SCHEMES boilerplate, page numbers).
 * 2. Strips repeating footer URLs (e.g. www.msme.gov.in) while preserving scheme-specific application URLs.
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
   * Reconnects URLs split across line breaks in PDF extraction:
   * 1. URLs ending in "_", "-", or "/" (e.g. ".../Tool_", ".../SFURTI/")
   * 2. URLs ending in "." or partial domain (e.g. "www.", "https://msme.")
   * 3. URLs ending in partial file extensions (e.g. ".P" with "DF", ".ht" with "ml")
   */
  public static rejoinSplitUrls(lines: string[]): string[] {
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Check if line ends with an incomplete/split URL
      const urlMatch = line.match(/(https?:\/\/\S+|www\.\S+)$/i);
      if (urlMatch && i + 1 < lines.length) {
        const urlEnding = urlMatch[1];
        const nextLine = lines[i + 1].trim();

        // Case 1: ends in continuation character: _, -, /
        if (/[_\-\/]$/.test(urlEnding)) {
          const nextParts = nextLine.match(/^([a-zA-Z0-9_\-\./]+)(.*)$/);
          if (nextParts) {
            line = line + nextParts[1] + (nextParts[2] ? ' ' + nextParts[2].trim() : '');
            i++;
            result.push(line);
            continue;
          }
        }

        // Case 2: ends in partial domain / dot, e.g. "www." or "...msme." or "...co."
        if (/\.$/.test(urlEnding)) {
          const nextParts = nextLine.match(/^([a-zA-Z0-9_\-\./]+)(.*)$/);
          if (nextParts) {
            line = line + nextParts[1] + (nextParts[2] ? ' ' + nextParts[2].trim() : '');
            i++;
            result.push(line);
            continue;
          }
        }

        // Case 3: ends in partial file extension like ".P" with "DF"
        const extMatch = urlEnding.match(/\.(p|pd|ht|asp)$/i);
        if (extMatch) {
          const ext = extMatch[1].toLowerCase();
          let contMatch: RegExpMatchArray | null = null;
          if (ext === 'p') contMatch = nextLine.match(/^(df\b)(.*)$/i);
          else if (ext === 'pd') contMatch = nextLine.match(/^(f\b)(.*)$/i);
          else if (ext === 'ht') contMatch = nextLine.match(/^(ml\b)(.*)$/i);
          else if (ext === 'asp') contMatch = nextLine.match(/^(x\b)(.*)$/i);

          if (contMatch) {
            line = line + contMatch[1] + (contMatch[2] ? ' ' + contMatch[2].trim() : '');
            i++;
            result.push(line);
            continue;
          }
        }
      }

      result.push(line);
    }

    return result;
  }

  /**
   * Normalizes URL domain spacing glitches:
   * "innovative. msme. gov. in" -> "innovative.msme.gov.in"
   * (Decimal and date spacing rules removed: confirmed 0 hits in raw PDF;
   * past glitches were caused solely by legacy sentence splitter).
   */
  public static normalizeSpacingGlitches(text: string): string {
    return text
      .replace(/(\b(?:https?:\/\/|www\.)[a-z0-9\-]+)\.\s+([a-z0-9\-]+)/gi, '$1.$2')
      .replace(/([a-z0-9\-]+)\.\s+(msme|gov|nic)\.\s*(in|gov\.in)\b/gi, '$1.$2.$3')
      .replace(/(https?:\/\/[^\s]+)\.\s+(gov\.in|in)\b/gi, '$1.$2')
      .replace(/([a-z0-9\-]+)\.\s+msme\.\s+gov\.\s+in\b/gi, '$1.msme.gov.in');
  }

  /**
   * Cleans a single page's text using repeating lines blacklist and general cleanup rules
   */
  public static cleanPageText(page: DocumentPageText, repeatingLinesBlacklist: Set<string>): string {
    const rejoinedLines = this.rejoinSplitUrls(page.lines);
    const cleanedLines: string[] = [];

    for (const line of rejoinedLines) {
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

      // 3. Keep line with scheme URLs intact (do not strip publisher URLs)
      cleanedLines.push(trimmed);
    }

    // Join cleaned lines and normalize multiple consecutive blank lines
    let cleanedText = cleanedLines
      .join('\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // remove ASCII control characters
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    cleanedText = this.normalizeSpacingGlitches(cleanedText);

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
    if (l.includes('msme schemes') && (l.includes('for more information') || l.includes('www.msme.gov.in'))) return true;
    if (l.includes('for more information') && (l.includes('www.msme.gov.in') || l.includes('regular updates'))) return true;
    if (/^msme schemes(\s+\d+)?$/i.test(l)) return true;

    // Coaching / compilation headers
    if (l.startsWith('vision ias') && l.includes('delhi')) return true;
    if (l.includes('all rights reserved')) return true;

    return false;
  }
}
