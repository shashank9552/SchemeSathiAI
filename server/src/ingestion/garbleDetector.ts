/**
 * SchemeSathi - Garble & Corruption Detector
 * 
 * Detects broken font encodings, garbled Devanagari text,
 * and font stream corruption in PDF extractions.
 */

export interface GarbleAnalysis {
  garbleCount: number;
  garbleRatePer1000: number;
  totalChars: number;
  devanagariChars: number;
  devanagariRatio: number;
  signatures: {
    sequenceMpa: number;            // "म्प्" artifact
    detachedMatras: number;         // Consonant + space + matra
    orphanMatras: number;           // Space/start + matra
    replacementGlyphs: number;      // \uFFFD
    danglingHalant: number;         // Halant without valid consonant
    legacyFontArtifacts: number;    // Legacy KrutiDev font artifacts (¿, ¡)
  };
  isGarbled: boolean;
  quarantineReason?: 'under_100_characters' | 'garble_rate_exceeded' | 'scanned_page';
}

/**
 * Evaluates text against known corruption signatures and font decoding errors.
 */
export function analyzeGarble(text: string, maxGarbleRate = 5.0): GarbleAnalysis {
  const totalChars = text.length;
  const devanagariMatches = text.match(/[\u0900-\u097F]/g) || [];
  const devanagariChars = devanagariMatches.length;
  const devanagariRatio = totalChars > 0 ? devanagariChars / totalChars : 0;

  // 1. Signature: sequence "म्प्" (common legacy KrutiDev/broken CID font artifact)
  const sequenceMpa = (text.match(/म्प्/g) || []).length;

  // 2. Signature: Devanagari consonant followed by space then detached matra
  const detachedMatras = (text.match(/[\u0915-\u0939]\s+[\u093E-\u094C\u0962\u0963]/g) || []).length;

  // 3. Signature: Orphan matras (start of word or following space without consonant)
  const orphanMatras = (text.match(/(?:^|\s)[\u093E-\u094C\u0962\u0963]/g) || []).length;

  // 4. Signature: Unicode replacement characters \uFFFD (missing glyph in font stream)
  const replacementGlyphs = (text.match(/\uFFFD/g) || []).length;

  // 5. Signature: Dangling halant (followed by space or non-consonant)
  const danglingHalant = (text.match(/[\u094D](?:\s+|$|[^\u0915-\u0939])/g) || []).length;

  // 6. Signature: Legacy font artifacts (KrutiDev/Chanakya specific characters like ¿, ¡)
  // Section mark (§) and paragraph mark (¶) are excluded to avoid false positives in English legal documents
  const legacyFontArtifacts = (text.match(/[¿¡]/g) || []).length;

  const signatures = {
    sequenceMpa,
    detachedMatras,
    orphanMatras,
    replacementGlyphs,
    danglingHalant,
    legacyFontArtifacts,
  };

  const garbleCount =
    sequenceMpa + detachedMatras + orphanMatras + replacementGlyphs + danglingHalant + legacyFontArtifacts;
  const garbleRatePer1000 = totalChars > 0 ? (garbleCount / totalChars) * 1000 : 0;

  let quarantineReason: GarbleAnalysis['quarantineReason'];
  if (totalChars === 0) {
    quarantineReason = 'scanned_page';
  } else if (totalChars < 100) {
    quarantineReason = 'under_100_characters';
  } else if (garbleRatePer1000 > maxGarbleRate) {
    quarantineReason = 'garble_rate_exceeded';
  }

  const isGarbled = Boolean(quarantineReason);

  return {
    garbleCount,
    garbleRatePer1000,
    totalChars,
    devanagariChars,
    devanagariRatio,
    signatures,
    isGarbled,
    quarantineReason,
  };
}
