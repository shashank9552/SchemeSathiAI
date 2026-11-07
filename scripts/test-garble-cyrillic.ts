import { analyzeGarble } from '../server/src/ingestion/garbleDetector.js';

// Sample chunk a83 text with Cyrillic corruption as reported in Atlas:
const sampleA83WithCyrillic = `Directory of Field Offices, MSME-DFOs & Testing Centres - Directory & Contact Details

12. Industrial Estate, Fax : 0141-2210553
Jaipur -302 006. Rajasthan
MSME-DFO, Ph : 0191-2431077 dcdi-jammu@dcmsme.gov.in обрал`;

console.log('Testing Cyrillic Quality Gate on chunk a83 with Cyrillic string:');
const result = analyzeGarble(sampleA83WithCyrillic);
console.log('isGarbled:', result.isGarbled);
console.log('quarantineReason:', result.quarantineReason);
console.log('foreignScriptChars count:', result.signatures.foreignScriptChars);
console.log('garbleRatePer1000:', result.garbleRatePer1000);
