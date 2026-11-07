import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { getEmbeddingProvider } from '../server/src/providers/index.js';

async function main() {
  console.log('Initializing embedding provider...');
  const provider = getEmbeddingProvider();

  // 10 representative chunks
  const testTexts = [
    "Prime Minister’s Employment Generation Programme (PMEGP) - Overview\nTo generate sustainable and continuous employment opportunities for rural and unemployed youth as well as prospective traditional artisans.",
    "Credit Guarantee Scheme for Micro & Small Enterprises (CGTMSE) - Quantum of Assistance\nCredit guarantee for loans up to Rs. 5 crore, without collateral.",
    "Micro & Small Enterprises Cluster Development Programme (MSE-CDP) Scheme - Common Facility Centers\nFinancial assistance up to 80% of project cost for Common Facility Centers.",
    "Scheme of Fund for Regeneration of Traditional Industries (SFURTI) - Objectives\nTo organize traditional industries and artisans into collectives by increasing production and value addition.",
    "Entrepreneurship Skill Development Programme (ESDP) - Target Beneficiaries\nYouth interested in setting up micro and small enterprises with focus on special category beneficiaries.",
    "Assistance to Training Institutions (ATI) Scheme - Scale of Assistance\nFinancial support to national level training institutions operating under Ministry of MSME.",
    "Coir Vikas Yojana - Science and Technology\nModernization of coir production and extraction processes with value added coir products.",
    "National SC-ST Hub Scheme - Key Interventions\nVendor development programs and special capacity building workshops for SC/ST entrepreneurs.",
    "Self Reliant India (SRI) Fund - Fund Features\nTotal corpus of INR 10,000 crore anchored by NSIC Venture Capital Fund Limited as mother fund.",
    "Raising and Accelerating MSME Performance (RAMP) - World Bank Support\nImproving access of MSMEs to market, finance, and technology upgradation through state level partnership."
  ];

  console.log(`Sending batch of ${testTexts.length} real texts to embedding provider...`);
  const startTime = performance.now();
  let retries = 0;

  let embeddings: number[][];
  try {
    embeddings = await provider.embedDocuments(testTexts);
  } catch (err: any) {
    console.error('Embedding failed:', err);
    process.exit(1);
  }
  const endTime = performance.now();
  const elapsedMs = endTime - startTime;

  console.log(`\n================================================================================`);
  console.log(`  REAL GEMINI EMBEDDING TIMING MEASUREMENT`);
  console.log(`================================================================================`);
  console.log(`Batch Size:           ${testTexts.length} texts`);
  console.log(`Total Elapsed Time:   ${elapsedMs.toFixed(2)} ms (${(elapsedMs / 1000).toFixed(2)} s)`);
  console.log(`Average per Text:     ${(elapsedMs / testTexts.length).toFixed(2)} ms`);
  console.log(`Retries Encountered:  ${retries}`);
  console.log(`Returned Vectors:     ${embeddings.length} (vector length: ${embeddings[0]?.length || 0})`);

  // Extrapolation to remainder
  const totalChunksToEmbed = 208; // Total new chunks
  const remainder = totalChunksToEmbed - testTexts.length; // 198
  const estimatedRemainderMs = (elapsedMs / testTexts.length) * remainder;

  console.log(`\n--- Extrapolation for Ingestion ---`);
  console.log(`Total Chunks to Embed:        ${totalChunksToEmbed}`);
  console.log(`Sampled:                      ${testTexts.length}`);
  console.log(`Remaining to Embed:           ${remainder}`);
  console.log(`Estimated Remaining Duration: ${(estimatedRemainderMs / 1000).toFixed(2)} seconds (~${Math.ceil(estimatedRemainderMs / 1000)}s)`);
}

main().catch(console.error);
