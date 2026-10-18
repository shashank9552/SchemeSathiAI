/**
 * SchemeSathi - Heading-Aware Document Chunker (Refined)
 */

export interface ChunkMetadata {
  schemeName: string;
  sectionTitle: string;
  documentTitle: string;
  sourceFile: string;
  pageNumber: number;
  category: string;
  level: string;
  language: string;
  chunkIndex: number;
  isTable: boolean;
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

  public chunkDocument(pages: PageContent[], docInfo: DocumentInfo): GeneratedChunk[] {
    const chunks: GeneratedChunk[] = [];
    let chunkGlobalIndex = 0;
    let currentSchemeHeading = docInfo.defaultSchemeName || docInfo.documentTitle;
    let currentSubHeading = '';
    let currentSectionTitle = 'Overview';

    for (const page of pages) {
      if (!page.text || page.text.trim().length === 0) continue;

      // Extract sections for this page
      const sections = this.splitPageIntoSections(page.text, currentSchemeHeading, currentSubHeading, currentSectionTitle);

      for (const section of sections) {
        if (section.parentScheme) {
          currentSchemeHeading = section.parentScheme;
        }
        if (section.subHeading !== undefined) {
          currentSubHeading = section.subHeading;
        }
        if (section.sectionTitle) {
          currentSectionTitle = section.sectionTitle;
        }

        const isTable = Boolean(section.isTable || section.content.includes('|---|') || section.content.includes('Guarantee Coverage where'));

        // If it's a table, keep rows together without splitting inside table
        if (isTable) {
          const formattedText = `${currentSchemeHeading} - ${currentSectionTitle}\n\n${section.content.trim()}`;
          chunks.push({
            text: formattedText,
            metadata: {
              schemeName: currentSchemeHeading,
              sectionTitle: currentSectionTitle,
              documentTitle: docInfo.documentTitle,
              sourceFile: docInfo.sourceFile,
              pageNumber: page.pageNumber,
              category: docInfo.category,
              level: docInfo.level,
              language: docInfo.language,
              chunkIndex: chunkGlobalIndex++,
              isTable: true,
            },
          });
          continue;
        }

        // Standard chunking within section
        const sectionChunks = this.chunkText(section.content, this.chunkSize, this.chunkOverlap);

        for (const rawChunk of sectionChunks) {
          if (rawChunk.trim().length === 0) continue;

          // Prepend "schemeName - sectionTitle" if not already present
          const headerPrefix = `${currentSchemeHeading} - ${currentSectionTitle}`;
          const chunkText = rawChunk.startsWith(headerPrefix)
            ? rawChunk.trim()
            : `${headerPrefix}\n\n${rawChunk.trim()}`;

          chunks.push({
            text: chunkText,
            metadata: {
              schemeName: currentSchemeHeading,
              sectionTitle: currentSectionTitle,
              documentTitle: docInfo.documentTitle,
              sourceFile: docInfo.sourceFile,
              pageNumber: page.pageNumber,
              category: docInfo.category,
              level: docInfo.level,
              language: docInfo.language,
              chunkIndex: chunkGlobalIndex++,
              isTable: false,
            },
          });
        }
      }
    }

    return chunks;
  }

  public splitPageIntoSections(
    pageText: string,
    initialParentScheme: string,
    initialSubHeading: string,
    initialSectionTitle: string
  ): Array<{
    parentScheme?: string;
    subHeading?: string;
    sectionTitle?: string;
    content: string;
    isTable?: boolean;
  }> {
    const lines = pageText.split('\n');
    const sections: Array<{
      parentScheme?: string;
      subHeading?: string;
      sectionTitle?: string;
      content: string;
      isTable?: boolean;
    }> = [];

    let activeParent = initialParentScheme;
    let activeSub = initialSubHeading;
    let activeSection = initialSectionTitle;
    let currentLines: string[] = [];
    let isCurrentTable = false;

    const commitSection = () => {
      if (currentLines.length > 0) {
        const content = currentLines.join('\n').trim();
        if (content.length > 0) {
          sections.push({
            parentScheme: activeParent,
            subHeading: activeSub,
            sectionTitle: activeSection,
            content,
            isTable: isCurrentTable,
          });
        }
        currentLines = [];
        isCurrentTable = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        currentLines.push('');
        continue;
      }

      // 1. Check if line is Table marker (e.g. CGTMSE table or markdown table)
      if (line.includes('|---|') || line.includes('extent of guarantee coverage under various categories')) {
        if (!isCurrentTable) {
          commitSection();
          isCurrentTable = true;
          activeSection = 'Extent of Guarantee Coverage';
        }
        currentLines.push(line);
        continue;
      }

      // 2. Check if line is a sub-heading (e.g. "1.1) 2nd Loan...", "1). MSME Sustainable...")
      if (this.isSubHeading(line)) {
        commitSection();
        activeSub = line;
        activeSection = line;
        currentLines.push(line);
        continue;
      }

      // 3. Check if line is a functional section label (e.g. "Objective:", "Eligibility:", "How to apply:")
      const funcLabel = this.detectFunctionalSection(line);
      if (funcLabel) {
        commitSection();
        activeSection = activeSub ? `${activeSub} - ${funcLabel}` : funcLabel;
        currentLines.push(line);
        continue;
      }

      // 4. Check if line is a top-level parent scheme heading
      const parentCheck = this.isParentSchemeHeading(line, lines[i + 1]);
      if (parentCheck.isMatch) {
        commitSection();
        activeParent = parentCheck.heading!;
        activeSub = '';
        activeSection = 'Overview';

        if (lines[i + 1] && this.isHeadingContinuation(lines[i + 1].trim())) {
          activeParent = `${line} ${lines[i + 1].trim()}`;
          currentLines.push(activeParent);
          i++; // skip next line as consumed
        } else {
          currentLines.push(line);
        }
        continue;
      }

      currentLines.push(line);
    }

    commitSection();

    if (sections.length === 0 && pageText.trim().length > 0) {
      sections.push({
        parentScheme: activeParent,
        subHeading: activeSub,
        sectionTitle: activeSection,
        content: pageText.trim(),
        isTable: false,
      });
    }

    return sections;
  }

  public isParentSchemeHeading(line: string, nextLine?: string): { isMatch: boolean; heading?: string } {
    const l = line.trim();

    if (/[,;:.]\s*$/.test(l)) return { isMatch: false };
    if (/^[•\-\*■□▪▫►–—]/.test(l)) return { isMatch: false };
    if (/^\d+\.\d+/.test(l)) return { isMatch: false }; // e.g. 1.1) is sub-heading
    if (/^\d+\)\./.test(l)) return { isMatch: false }; // e.g. 1). is sub-heading
    if (/^(disability|person with disability|enterprise|trading|borrowers?)\s*(\(pwd\))?/i.test(l)) return { isMatch: false };
    if (/^(objective|eligibility|scheme applicable for|detailed information|benefits|financial assistance|how to apply|who can apply|criteria|extent of guarantee coverage):?$/i.test(l)) {
      return { isMatch: false };
    }

    // Integer numbered scheme: "1. Prime Minister...", "2. Credit Guarantee..."
    if (/^(\d+\.\s+[A-Z]|\b(scheme|programme|mission|yojana)\s+\d+:?)/i.test(l) && !/^\d+\.\d+/.test(l)) {
      if (l.length <= 140) {
        return { isMatch: true, heading: l };
      }
    }

    // Acronym or keyword ending, but not table words
    if (
      /(scheme|programme|program|yojana|mission|scholarship)\s*$/i.test(l) &&
      l.length <= 100 &&
      !/(aims to|provides|covered under|wherein|eligible|guidelines|procedure|policy|training)/i.test(l)
    ) {
      return { isMatch: true, heading: l };
    }

    // Heading continuing to next line
    if (
      nextLine &&
      /^(prime minister|national|central|state|pradhan mantri|chief minister|atal|international|credit|technology|micro)/i.test(l) &&
      this.isHeadingContinuation(nextLine.trim())
    ) {
      return { isMatch: true, heading: l };
    }

    return { isMatch: false };
  }

  public isSubHeading(line: string): boolean {
    const l = line.trim();
    if (/^\d+\.\d+\)?\s+[A-Z]/.test(l)) return true;
    if (/^\d+\)\.\s+[A-Z]/.test(l)) return true;
    return false;
  }

  public detectFunctionalSection(line: string): string | null {
    const l = line.trim();
    if (/^objective:?/i.test(l)) return 'Objective';
    if (/^(scheme applicable for|eligibility|who can apply):?/i.test(l)) return 'Scheme applicable for (Eligibility)';
    if (/^(nature of assistance|financial assistance|benefits):?/i.test(l)) return 'Financial Assistance & Benefits';
    if (/^how to apply:?/i.test(l)) return 'How to apply';
    if (/^(extent of guarantee coverage|coverage):?/i.test(l)) return 'Extent of Guarantee Coverage';
    return null;
  }

  private isHeadingContinuation(line: string): boolean {
    const l = line.trim();
    if (/^[•\-\*■]/.test(l)) return false;
    if (/[,;:.]\s*$/.test(l)) return false;
    return /(programme|program|scheme|yojana|mission|initiative|\([A-Z0-9\-]+\))\s*$/i.test(l) && l.length <= 80;
  }

  public chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const trimmed = text.trim();
    if (trimmed.length <= chunkSize) {
      return [trimmed];
    }

    const units = this.splitIntoSemanticUnits(trimmed);
    const chunks: string[] = [];

    let currentUnits: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const unitLength = unit.length + 1;

      if (currentLength + unitLength > chunkSize && currentUnits.length > 0) {
        const chunkText = currentUnits.join('\n').trim();
        chunks.push(chunkText);

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

  private splitIntoSemanticUnits(text: string): string[] {
    const rawLines = text.split('\n');
    const units: string[] = [];
    let currentUnit = '';

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue;

      const isBulletOrNumbered = /^[•\-\*■□▪▫►–—]|\d+\.\s+/.test(line);

      if (isBulletOrNumbered) {
        if (currentUnit.trim()) {
          units.push(currentUnit.trim());
        }
        currentUnit = line;
      } else {
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
