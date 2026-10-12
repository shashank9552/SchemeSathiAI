/**
 * SchemeSathi - Heading-Aware Document Chunker
 * 
 * Splits documents at scheme headings first, then applies recursive chunking
 * by CHUNK_SIZE and CHUNK_OVERLAP within each section, ensuring bulleted lists
 * and eligibility criteria are kept intact.
 */

export interface ChunkMetadata {
  schemeName: string;
  documentTitle: string;
  sourceFile: string;
  pageNumber: number;
  category: string;
  level: string;
  language: string;
  chunkIndex: number;
}

export interface GeneratedChunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface PageContent {
  pageNumber: number;
  text: string;
}

export interface DocumentInfo {
  sourceFile: string;
  documentTitle: string;
  defaultSchemeName: string;
  category: string;
  level: string;
  language: string;
}

export class DocumentChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize = 800, chunkOverlap = 120) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Chunks a document consisting of multiple cleaned pages.
   */
  public chunkDocument(pages: PageContent[], docInfo: DocumentInfo): GeneratedChunk[] {
    const chunks: GeneratedChunk[] = [];
    let chunkGlobalIndex = 0;
    let currentSchemeHeading = docInfo.defaultSchemeName || docInfo.documentTitle;

    for (const page of pages) {
      if (!page.text || page.text.trim().length === 0) continue;

      // Split page text into sections based on detected scheme headings
      const sections = this.splitPageIntoHeadingSections(page.text, currentSchemeHeading);

      for (const section of sections) {
        // Update currentSchemeHeading if this section had a detected heading
        if (section.heading) {
          currentSchemeHeading = section.heading;
        }

        // Chunk section content respecting bullet/sentence boundaries
        const sectionChunks = this.chunkText(section.content, this.chunkSize, this.chunkOverlap);

        for (const textChunk of sectionChunks) {
          if (textChunk.trim().length === 0) continue;

          chunks.push({
            text: textChunk.trim(),
            metadata: {
              schemeName: currentSchemeHeading,
              documentTitle: docInfo.documentTitle,
              sourceFile: docInfo.sourceFile,
              pageNumber: page.pageNumber,
              category: docInfo.category,
              level: docInfo.level,
              language: docInfo.language,
              chunkIndex: chunkGlobalIndex++,
            },
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Splits page text into sections by detecting scheme headings
   */
  public splitPageIntoHeadingSections(
    pageText: string,
    initialHeading: string
  ): Array<{ heading: string; content: string }> {
    const lines = pageText.split('\n');
    const sections: Array<{ heading: string; content: string }> = [];

    let activeHeading = initialHeading;
    let currentSectionLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        currentSectionLines.push('');
        continue;
      }

      // Check if current line is a scheme heading (or title)
      if (this.isSchemeHeading(line, lines[i + 1])) {
        // If we already have accumulated content, save previous section
        if (currentSectionLines.length > 0) {
          const content = currentSectionLines.join('\n').trim();
          if (content.length > 0) {
            sections.push({ heading: activeHeading, content });
          }
          currentSectionLines = [];
        }

        // Sometimes headings span 2 lines, e.g.:
        // Prime Minister’s Employment
        // Generation Programme (PMEGP)
        if (
          lines[i + 1] &&
          this.isHeadingContinuation(lines[i + 1].trim())
        ) {
          activeHeading = `${line} ${lines[i + 1].trim()}`;
          currentSectionLines.push(activeHeading);
          i++; // skip next line as it was consumed as heading continuation
        } else {
          activeHeading = line;
          currentSectionLines.push(activeHeading);
        }
      } else {
        currentSectionLines.push(line);
      }
    }

    if (currentSectionLines.length > 0) {
      const content = currentSectionLines.join('\n').trim();
      if (content.length > 0) {
        sections.push({ heading: activeHeading, content });
      }
    }

    if (sections.length === 0 && pageText.trim().length > 0) {
      sections.push({ heading: initialHeading, content: pageText.trim() });
    }

    return sections;
  }

  /**
   * Checks if a line is a scheme title/heading
   */
  public isSchemeHeading(line: string, nextLine?: string): boolean {
    const l = line.trim();

    // Ignore bullet points and typical list items
    if (/^[•\-\*■□▪▫►–—]/.test(l)) return false;
    if (/^\([a-z0-9]+\)/i.test(l)) return false;

    // Sub-headings like Objective:, Eligibility:, etc. are not the scheme name itself
    if (/^(objective|eligibility|scheme applicable for|detailed information|benefits|financial assistance|how to apply|who can apply|criteria):?$/i.test(l)) {
      return false;
    }

    // Numbered scheme headings, e.g. "1. Prime Minister...", "SCHEME 2:", "2. Credit Guarantee..."
    if (/^(\d+\.|\d+\)|\b(scheme|programme|mission|yojana)\s+\d+:?)/i.test(l)) {
      return l.length <= 140;
    }

    // Check for scheme keywords with title length (< 120 chars) and without trailing sentence period
    const schemeKeywords = /(scheme|programme|program|yojana|mission|abhiyan|scholarship|assistance|fund|initiative|subsid|portal|pmegp|cgtmse|pmay|mudra)/i;
    if (schemeKeywords.test(l) && l.length <= 120 && !l.endsWith('.')) {
      return true;
    }

    // Heading that continues onto next line (e.g. "Prime Minister's Employment" followed by "Generation Programme (PMEGP)")
    if (
      nextLine &&
      /^(prime minister|national|central|state|pradhan mantri|chief minister|atal)/i.test(l) &&
      this.isHeadingContinuation(nextLine.trim())
    ) {
      return true;
    }

    return false;
  }

  private isHeadingContinuation(line: string): boolean {
    const l = line.trim();
    if (/^[•\-\*■]/.test(l)) return false;
    return /(programme|program|scheme|yojana|mission|initiative|\([a-z0-9\-]+\))/i.test(l) && l.length <= 80;
  }

  /**
   * Chunks text into blocks of max `chunkSize` with `chunkOverlap`,
   * preserving bullet points, sentences, and lists without cutting them mid-thought.
   */
  public chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const trimmed = text.trim();
    if (trimmed.length <= chunkSize) {
      return [trimmed];
    }

    // Split text into semantic atomic units (paragraphs, bullet points, or sentences)
    const units = this.splitIntoSemanticUnits(trimmed);
    const chunks: string[] = [];

    let currentUnits: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const unitLength = unit.length + 1; // + 1 for newline/space separator

      if (currentLength + unitLength > chunkSize && currentUnits.length > 0) {
        // Finalize current chunk
        const chunkText = currentUnits.join('\n').trim();
        chunks.push(chunkText);

        // Compute overlap: take units from the end of current chunk up to chunkOverlap characters
        const overlapUnits: string[] = [];
        let overlapLen = 0;

        for (let j = currentUnits.length - 1; j >= 0; j--) {
          const cand = currentUnits[j];
          if (overlapLen + cand.length + 1 <= chunkOverlap) {
            overlapUnits.unshift(cand);
            overlapLen += cand.length + 1;
          } else {
            break;
          }
        }

        currentUnits = [...overlapUnits, unit];
        currentLength = currentUnits.reduce((acc, u) => acc + u.length + 1, 0);
      } else {
        currentUnits.push(unit);
        currentLength += unitLength;
      }
    }

    if (currentUnits.length > 0) {
      const remainingChunk = currentUnits.join('\n').trim();
      if (remainingChunk.length > 0) {
        chunks.push(remainingChunk);
      }
    }

    return chunks;
  }

  /**
   * Splits text into semantic units: bullet points, paragraphs, or sentences.
   */
  private splitIntoSemanticUnits(text: string): string[] {
    const rawLines = text.split('\n');
    const units: string[] = [];
    let currentUnit = '';

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue;

      // If line starts with a bullet point or numbered item, start a new semantic unit
      const isBulletOrNumbered = /^[•\-\*■□▪▫►–—]|\d+\.\s+/.test(line);

      if (isBulletOrNumbered) {
        if (currentUnit.trim()) {
          units.push(currentUnit.trim());
        }
        currentUnit = line;
      } else {
        // Check if previous unit ended or continues
        if (currentUnit) {
          currentUnit += ' ' + line;
        } else {
          currentUnit = line;
        }
      }
    }

    if (currentUnit.trim()) {
      units.push(currentUnit.trim());
    }

    // For any unit that exceeds chunkSize by itself (e.g. a huge paragraph without bullets),
    // split it further by sentence boundaries (. | ? | ! | ।)
    const refinedUnits: string[] = [];
    for (const unit of units) {
      if (unit.length <= this.chunkSize) {
        refinedUnits.push(unit);
      } else {
        const sentences = unit.match(/[^.!?।]+[.!?।]+|\S+$/g) || [unit];
        for (const s of sentences) {
          const st = s.trim();
          if (st) refinedUnits.push(st);
        }
      }
    }

    return refinedUnits;
  }
}
