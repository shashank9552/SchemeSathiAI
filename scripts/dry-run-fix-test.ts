import fs from 'node:fs';

const storedChunks: any[] = JSON.parse(fs.readFileSync('data/processed/refined_chunks_190.json', 'utf8'));
const relevant = storedChunks.filter(c => c.pageNumber >= 49 && c.pageNumber <= 53);

console.log('================================================================================');
console.log('  CURRENT STORED CHUNKS IN ATLAS / REFINED_CHUNKS_190 (PAGES 49 TO 53)');
console.log('================================================================================\n');

relevant.forEach(c => {
  console.log(`[Idx ${c.chunkIndex}] Page: ${c.pageNumber} | Scheme: "${c.schemeName}" | Section: "${c.sectionTitle}"`);
  console.log(`  Prefix: "${c.text.slice(0, 70).replace(/\n/g, ' ')}..."\n`);
});

console.log('================================================================================');
console.log('  PROPOSED DRY-RUN DIFF FOR PAGES 49 TO 53');
console.log('================================================================================\n');

console.log(`Page 49 (Lean Scheme continuation):
  [Idx 127] Page 49:
    Scheme:  "3) MSME COMPETITIVE (LEAN) SCHEME" (or "National Institute for MSME (ni-msme)" in legacy)
             -> "3) MSME COMPETITIVE (LEAN) SCHEME"
    Section: "Detailed Information"
  [Idx 128] Page 49:
    Scheme:  "3) MSME COMPETITIVE (LEAN) SCHEME"
    Section: "How to apply"

Page 50 (SRI Fund Page 1):
  [Idx 129] Page 50:
    Scheme:  "Mahatma Gandhi Institute for Rural Industrialization (MGIRI)"
             -> "Self Reliant India (SRI) Fund"
    Section: "Objective" -> "About the scheme & Fund Objective"
  [Idx 130] Page 50:
    Scheme:  "Mahatma Gandhi Institute for Rural Industrialization (MGIRI)"
             -> "Self Reliant India (SRI) Fund"
    Section: "Overview" -> "SRI Fund Structure"

Page 51 (SRI Fund Page 2 - Continuation):
  [Idx 130 in Atlas / 131 in 191] Page 51:
    Scheme:  "MSME SAMADHAAN (Delayed Payments Monitoring)"
             -> "Self Reliant India (SRI) Fund"
    Section: "Overview" -> "Fund Features & Corpus"
  [Idx 131 in Atlas / 132 in 191] Page 51:
    Scheme:  "MSME SAMADHAAN (Delayed Payments Monitoring)"
             -> "Self Reliant India (SRI) Fund"
    Section: "Overview" -> "Daughter Funds & Scope"

Page 52 (RAMP Page 1):
  [Idx 132 in Atlas / 133 in 191] Page 52:
    Scheme:  "MSME SAMBANDH (Public Procurement Policy Monitoring)"
             -> "Raising and Accelerating MSME Performance (RAMP)"
    Section: "Overview" -> "About the scheme & Objectives"
  [Idx 133 in Atlas / 134 in 191] Page 52:
    Scheme:  "MSME SAMBANDH (Public Procurement Policy Monitoring)"
             -> "Raising and Accelerating MSME Performance (RAMP)"
    Section: "Objective" -> "Objectives & Benefits"
  [Idx 134 in Atlas / 135 in 191] Page 52:
    Scheme:  "MSME SAMBANDH (Public Procurement Policy Monitoring)"
             -> "Raising and Accelerating MSME Performance (RAMP)"
    Section: "Overview" -> "Key Benefits & Target Beneficiaries"

Page 53 (RAMP Page 2 - Continuation):
  [Idx 135 in Atlas / 136 in 191] Page 53:
    Scheme:  "Udyam Registration Portal"
             -> "Raising and Accelerating MSME Performance (RAMP)"
    Section: "Scheme applicable for (Eligibility)"
`);
