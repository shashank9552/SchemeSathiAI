/**
 * SchemeSathi — Natural Questions Evaluation & Threshold Trade-off Script
 */

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { config } from '../server/src/config/index.js';
import { VectorRetriever } from '../server/src/rag/retriever.js';
import { getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';
import { FaithfulnessGuard } from '../server/src/rag/faithfulnessGuard.js';
import { RefusalReason } from '../server/src/rag/types.js';

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  subCategory?: string;
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
}

interface EvalResult {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  question: string;
  topScore: number;
  gate1PassedAtConfig: boolean;
  llmAnswerable: boolean;
  faithful: boolean;
  ungroundedNumbers: string[];
  refusalReasonAtConfig: RefusalReason | 'none';
  finalDecisionAtConfig: 'Answered' | 'Refused';
  answerText: string;
  citations: Array<{ schemeName: string; pageNumber: number }>;
}

async function runNaturalEvaluation() {
  const questionsPath = path.resolve('scripts/eval/natural-questions.json');
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const retriever = new VectorRetriever();
  const llmProvider = getLLMProvider();

  console.log(`======================================================================`);
  console.log(`  SchemeSathi — Natural Citizen Questions Live Evaluation`);
  console.log(`  Questions: ${questions.length} (25 Answerable, 10 Unanswerable)`);
  console.log(`  Configured MIN_SIMILARITY: ${config.MIN_SIMILARITY}`);
  console.log(`======================================================================\n`);

  const results: EvalResult[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    process.stdout.write(`Evaluating [${i + 1}/${questions.length}] ${q.id} ... `);

    // 1. Vector Retrieval
    const retResult = await retriever.retrieveWithTiming(q.question, 5);
    const chunks = retResult.chunks;
    const topScore = chunks.length > 0 ? chunks[0].score : 0;

    // 2. Gate 1 at current configured threshold
    const gate1PassedAtConfig = topScore >= config.MIN_SIMILARITY;

    // 3. LLM Synthesis
    const lang = q.language;
    const systemInstruction = PromptBuilder.buildSystemInstruction(lang);
    const prompt = PromptBuilder.buildUserPrompt(q.question, chunks);

    let rawLlmOutput = '';
    let parsedPayload: any = null;
    try {
      rawLlmOutput = await llmProvider.generateResponse(prompt, systemInstruction);
      const cleaned = rawLlmOutput
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      parsedPayload = JSON.parse(cleaned);
    } catch (err: any) {
      console.error(`LLM Error on ${q.id}:`, err.message);
    }

    const llmAnswerable = Boolean(parsedPayload?.answerable);
    const answerText = String(parsedPayload?.answer || '');

    // 4. FaithfulnessGuard
    const validChunkMap = new Map(chunks.map((c) => [c.id, c]));
    const rawUsedIds = Array.isArray(parsedPayload?.usedChunkIds) ? parsedPayload.usedChunkIds : [];
    const validatedIds = rawUsedIds.filter((id: string) => validChunkMap.has(id));
    const finalChunkIds = validatedIds.length > 0 ? validatedIds : [chunks[0]?.id].filter(Boolean);
    const usedChunks = finalChunkIds.map((id: string) => validChunkMap.get(id)!).filter(Boolean);

    const faithfulness = FaithfulnessGuard.verifyFaithfulness(
      answerText,
      usedChunks.map((c) => c.text),
      q.question
    );

    // Determine refusal reason at current configured threshold (0.86)
    let refusalReason: RefusalReason | 'none' = 'none';
    let finalDecision: 'Answered' | 'Refused' = 'Answered';

    if (!gate1PassedAtConfig) {
      refusalReason = 'below_threshold';
      finalDecision = 'Refused';
    } else if (!llmAnswerable) {
      refusalReason = 'llm_not_answerable';
      finalDecision = 'Refused';
    } else if (!faithfulness.faithful) {
      refusalReason = 'ungrounded_number';
      finalDecision = 'Refused';
    }

    const citations = finalDecision === 'Answered'
      ? finalChunkIds.map((id: string) => {
          const c = validChunkMap.get(id)!;
          return { schemeName: c.schemeName, pageNumber: c.pageNumber };
        })
      : [];

    results.push({
      id: q.id,
      category: q.category,
      language: q.language,
      question: q.question,
      topScore,
      gate1PassedAtConfig,
      llmAnswerable,
      faithful: faithfulness.faithful,
      ungroundedNumbers: faithfulness.ungroundedNumbers,
      refusalReasonAtConfig: refusalReason,
      finalDecisionAtConfig: finalDecision,
      answerText,
      citations,
    });

    console.log(`Score: ${topScore.toFixed(4)} | Gate1: ${gate1PassedAtConfig ? 'PASS' : 'BLOCKED'} | LLM: ${llmAnswerable} | Guard: ${faithfulness.faithful ? 'OK' : 'FLAG'} | Decision: ${finalDecision} (${refusalReason})`);

    // Brief rate limiter spacing
    await new Promise((r) => setTimeout(r, 600));
  }

  // --- Print Summary Table ---
  console.log(`\n========================================================================================================================`);
  console.log(`  Natural Citizen Questions Evaluation Results Table (Current MIN_SIMILARITY = ${config.MIN_SIMILARITY})`);
  console.log(`========================================================================================================================`);
  console.log(
    `ID         | Cat   | Lang | TopScore | Gate 1 (>=${config.MIN_SIMILARITY}) | LLM Ans / Gate 2           | Faithful | Refusal Reason      | Final Decision | Citations`
  );
  console.log(
    `-----------|-------|------|----------|------------------|----------------------------|----------|---------------------|----------------|----------------`
  );
  for (const r of results) {
    const catShort = r.category === 'answerable' ? 'ANS  ' : 'UNANS';
    const gate1Str = r.gate1PassedAtConfig ? 'PASSED          ' : 'BLOCKED (refuse)';
    const llmAnsStr = r.gate1PassedAtConfig
      ? (r.llmAnswerable ? 'true' : 'false').padEnd(26)
      : 'LLM not called (simulated)';
    const faithStr = r.gate1PassedAtConfig ? (r.faithful ? 'true    ' : 'FAIL    ') : 'N/A     ';
    const reasonStr = (r.refusalReasonAtConfig || 'none').padEnd(19);
    const decStr = r.finalDecisionAtConfig.padEnd(14);
    const citeStr = r.citations.length > 0 ? `${r.citations.length} cited (P.${r.citations.map(c => c.pageNumber).join(',')})` : '0 citations';

    console.log(
      `${r.id.padEnd(10)} | ${catShort} | ${r.language.padEnd(4)} | ${r.topScore.toFixed(6)} | ${gate1Str} | ${llmAnsStr} | ${faithStr} | ${reasonStr} | ${decStr} | ${citeStr}`
    );
  }

  // --- Threshold Trade-off Simulation ---
  const candidateThresholds = [0.78, 0.80, 0.82, 0.84, 0.86];
  const answerable = results.filter((r) => r.category === 'answerable');
  const unanswerable = results.filter((r) => r.category === 'unanswerable');

  console.log(`\n========================================================================================================================`);
  console.log(`  Threshold Trade-off Simulation Analysis across [0.78, 0.80, 0.82, 0.84, 0.86]`);
  console.log(`========================================================================================================================`);
  console.log(`Threshold | Ans Gate1 Pass | Ans Answered | False Refusals (FRR) | Unans Gate1 Blocked | Unans Leaked | Unans Hallucinated | Accuracy`);
  console.log(`----------|----------------|--------------|----------------------|---------------------|--------------|--------------------|---------`);

  for (const t of candidateThresholds) {
    // Answerable questions behavior at threshold t
    let ansGate1Pass = 0;
    let ansAnswered = 0;
    for (const a of answerable) {
      if (a.topScore >= t) {
        ansGate1Pass++;
        if (a.llmAnswerable && a.faithful) {
          ansAnswered++;
        }
      }
    }
    const falseRefusals = answerable.length - ansAnswered;
    const frr = ((falseRefusals / answerable.length) * 100).toFixed(1);

    // Unanswerable questions behavior at threshold t
    let unansBlocked = 0;
    let unansLeaked = 0;
    let unansHallucinated = 0;
    for (const u of unanswerable) {
      if (u.topScore < t) {
        unansBlocked++;
      } else {
        unansLeaked++;
        // If it passed Gate 1, did the LLM hallucinate an answer?
        if (u.llmAnswerable && u.faithful) {
          unansHallucinated++;
        }
      }
    }

    const totalCorrect = ansAnswered + (unanswerable.length - unansHallucinated);
    const overallAcc = ((totalCorrect / results.length) * 100).toFixed(1);

    console.log(
      `${t.toFixed(2).padEnd(9)} | ${ansGate1Pass}/${answerable.length} (${((ansGate1Pass/answerable.length)*100).toFixed(0)}%)      | ${ansAnswered}/${answerable.length} (${((ansAnswered/answerable.length)*100).toFixed(0)}%)   | ${falseRefusals}/${answerable.length} (${frr}%)         | ${unansBlocked}/${unanswerable.length} (${((unansBlocked/unanswerable.length)*100).toFixed(0)}%)           | ${unansLeaked}/${unanswerable.length} (${((unansLeaked/unanswerable.length)*100).toFixed(0)}%)     | ${unansHallucinated}/${unanswerable.length} (${((unansHallucinated/unanswerable.length)*100).toFixed(0)}%)          | ${totalCorrect}/${results.length} (${overallAcc}%)`
    );
  }

  console.log(`\n========================================================================================================================`);
  console.log(`  Threshold Recommendation Analysis`);
  console.log(`========================================================================================================================`);

  // Write results to disk for inspection
  const outPath = path.resolve('data/processed/natural_questions_eval_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results saved to: ${outPath}`);

  process.exit(0);
}

runNaturalEvaluation().catch((err) => {
  console.error('Fatal evaluation error:', err);
  process.exit(1);
});
