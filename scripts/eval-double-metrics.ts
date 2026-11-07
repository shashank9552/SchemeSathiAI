import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

import { VectorRetriever } from '../server/src/rag/retriever.js';
import { getLLMProvider } from '../server/src/providers/index.js';
import { PromptBuilder } from '../server/src/rag/promptBuilder.js';
import { FaithfulnessGuard } from '../server/src/rag/faithfulnessGuard.js';
import { config } from '../server/src/config/index.js';

interface QuestionItem {
  id: string;
  category: 'answerable' | 'unanswerable';
  language: 'en' | 'hi';
  question: string;
  expectedScheme?: string;
  expectedPage?: number;
  expectedPhrase?: string;
  note?: string;
}

interface QuestionEvaluation {
  id: string;
  question: string;
  language: 'en' | 'hi';
  topScore: number;
  gate1Passed: boolean;
  llmAnswerable: boolean;
  faithful: boolean;
  decision: 'Answered' | 'Refused';
  reason: string;
}

async function evaluateAll(questions: QuestionItem[], retriever: VectorRetriever, llmProvider: any): Promise<Map<string, QuestionEvaluation>> {
  const evalMap = new Map<string, QuestionEvaluation>();

  for (const q of questions) {
    const retResult = await retriever.retrieveWithTiming(q.question, 5);
    const chunks = retResult.chunks;
    const topScore = chunks.length > 0 ? chunks[0].score : 0;
    const gate1Passed = topScore >= config.MIN_SIMILARITY;

    if (!gate1Passed) {
      evalMap.set(q.id, {
        id: q.id,
        question: q.question,
        language: q.language,
        topScore,
        gate1Passed: false,
        llmAnswerable: false,
        faithful: true,
        decision: 'Refused',
        reason: 'below_threshold',
      });
      continue;
    }

    // Call LLM
    const prompt = PromptBuilder.buildUserPrompt(q.question, chunks);
    const system = PromptBuilder.buildSystemInstruction(q.language);

    try {
      const rawLlm = await llmProvider.generateResponse(prompt, system);
      let parsed = { answerable: false, answer: '', usedChunkIds: [] };
      try {
        const cleaned = rawLlm.replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { answerable: false, answer: rawLlm, usedChunkIds: [] };
      }

      if (!parsed.answerable) {
        evalMap.set(q.id, {
          id: q.id,
          question: q.question,
          language: q.language,
          topScore,
          gate1Passed: true,
          llmAnswerable: false,
          faithful: true,
          decision: 'Refused',
          reason: 'llm_not_answerable',
        });
      } else {
        // Faithfulness check
        const guardRes = FaithfulnessGuard.validateNumericalFaithfulness(parsed.answer, chunks, q.question);
        if (!guardRes.faithful) {
          evalMap.set(q.id, {
            id: q.id,
            question: q.question,
            language: q.language,
            topScore,
            gate1Passed: true,
            llmAnswerable: true,
            faithful: false,
            decision: 'Refused',
            reason: 'ungrounded_number',
          });
        } else {
          evalMap.set(q.id, {
            id: q.id,
            question: q.question,
            language: q.language,
            topScore,
            gate1Passed: true,
            llmAnswerable: true,
            faithful: true,
            decision: 'Answered',
            reason: 'grounded_answer',
          });
        }
      }
    } catch (err: any) {
      evalMap.set(q.id, {
        id: q.id,
        question: q.question,
        language: q.language,
        topScore,
        gate1Passed: true,
        llmAnswerable: false,
        faithful: true,
        decision: 'Refused',
        reason: 'llm_error',
      });
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  return evalMap;
}

function computeMetrics(dataset: QuestionItem[], evalMap: Map<string, QuestionEvaluation>) {
  let tp = 0; // Ground truth answerable, system answered
  let fn = 0; // Ground truth answerable, system refused
  let tn = 0; // Ground truth unanswerable, system refused
  let fp = 0; // Ground truth unanswerable, system answered

  for (const item of dataset) {
    const res = evalMap.get(item.id);
    if (!res) continue;

    if (item.category === 'answerable') {
      if (res.decision === 'Answered') tp++;
      else fn++;
    } else {
      if (res.decision === 'Refused') tn++;
      else fp++;
    }
  }

  const total = tp + fn + tn + fp;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const refusalRate = total > 0 ? (fn + tn) / total : 0;

  return { tp, fn, tn, fp, total, precision, recall, f1, accuracy, refusalRate };
}

async function main() {
  const origPath = path.resolve('scripts/eval/natural-questions.original.json');
  const revPath = path.resolve('scripts/eval/natural-questions.json');

  const origQuestions: QuestionItem[] = JSON.parse(fs.readFileSync(origPath, 'utf8'));
  const revQuestions: QuestionItem[] = JSON.parse(fs.readFileSync(revPath, 'utf8'));

  console.log('Connecting to retriever and LLM provider...');
  const retriever = new VectorRetriever();
  const llmProvider = getLLMProvider();

  // Combine unique questions
  const allUnique = new Map<string, QuestionItem>();
  origQuestions.forEach(q => allUnique.set(q.id, q));
  revQuestions.forEach(q => allUnique.set(q.id, q));

  console.log(`Evaluating ${allUnique.size} unique questions against live Atlas and Gemini...`);
  const evalMap = await evaluateAll(Array.from(allUnique.values()), retriever, llmProvider);

  // Save raw eval results to disk
  const rawResults = Array.from(evalMap.values());
  fs.writeFileSync('scripts/eval/live-eval-results.json', JSON.stringify(rawResults, null, 2), 'utf8');
  console.log('Saved raw evaluation results to scripts/eval/live-eval-results.json\n');

  const origMetrics = computeMetrics(origQuestions, evalMap);
  const revMetrics = computeMetrics(revQuestions, evalMap);

  console.log('================================================================================');
  console.log('  EVALUATION METRICS COMPARISON: ORIGINAL VS REVISED LABELS');
  console.log(`  Threshold: MIN_SIMILARITY = ${config.MIN_SIMILARITY}`);
  console.log('================================================================================\n');

  console.log('--- 1. ORIGINAL LABELS (25 Answerable, 10 Unanswerable) ---');
  console.log(`Total Questions:    ${origMetrics.total}`);
  console.log(`True Positives:     ${origMetrics.tp} (Answerable answered)`);
  console.log(`False Negatives:    ${origMetrics.fn} (Answerable refused)`);
  console.log(`True Negatives:     ${origMetrics.tn} (Unanswerable refused)`);
  console.log(`False Positives:    ${origMetrics.fp} (Unanswerable answered)`);
  console.log(`Precision:          ${(origMetrics.precision * 100).toFixed(2)}%`);
  console.log(`Recall:             ${(origMetrics.recall * 100).toFixed(2)}%`);
  console.log(`F1 Score:           ${origMetrics.f1.toFixed(4)}`);
  console.log(`Accuracy:           ${(origMetrics.accuracy * 100).toFixed(2)}%`);
  console.log(`Refusal Rate:       ${(origMetrics.refusalRate * 100).toFixed(2)}%\n`);

  console.log('--- 2. REVISED LABELS (21 Answerable, 15 Unanswerable) ---');
  console.log(`Total Questions:    ${revMetrics.total}`);
  console.log(`True Positives:     ${revMetrics.tp} (Answerable answered)`);
  console.log(`False Negatives:    ${revMetrics.fn} (Answerable refused)`);
  console.log(`True Negatives:     ${revMetrics.tn} (Unanswerable refused)`);
  console.log(`False Positives:    ${revMetrics.fp} (Unanswerable answered)`);
  console.log(`Precision:          ${(revMetrics.precision * 100).toFixed(2)}%`);
  console.log(`Recall:             ${(revMetrics.recall * 100).toFixed(2)}%`);
  console.log(`F1 Score:           ${revMetrics.f1.toFixed(4)}`);
  console.log(`Accuracy:           ${(revMetrics.accuracy * 100).toFixed(2)}%`);
  console.log(`Refusal Rate:       ${(revMetrics.refusalRate * 100).toFixed(2)}%\n`);

  process.exit(0);
}

main().catch(console.error);
