/**
 * SchemeSathi — End-to-End Chat API Evaluation Script
 * 
 * Runs all 20 questions from scripts/eval/questions.json through POST /api/chat.
 * Captures:
 * - Question
 * - Raw Top Vector Search Score
 * - First Gate Status (Passed >= 0.86 vs Refused < 0.86)
 * - LLM Answerable Decision (true / false)
 * - Final Decision (Answered vs Refused)
 * - Generated Citations (Count + Scheme + Page)
 * - Latency (ms)
 */

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { app } from '../server/src/app.js';

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

interface ApiResult {
  id: string;
  category: string;
  language: string;
  question: string;
  topScore: number;
  firstGatePassed: boolean;
  llmAnswerable: boolean;
  finalDecision: 'Answered' | 'Refused (Gate 1 Vector)' | 'Refused (Gate 2 LLM)';
  answerText: string;
  citations: Array<{ schemeName: string; pageNumber: number; sourceFile: string }>;
  latencyMs: number;
}

async function runChatApiEvaluation() {
  const PORT = 5005;
  const server = app.listen(PORT);
  console.log(`Test server running on port ${PORT}...`);

  const questionsPath = path.resolve('scripts/eval/questions.json');
  const questions: QuestionItem[] = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const results: ApiResult[] = [];
  const logLines: string[] = [];

  function log(msg: string = '') {
    console.log(msg);
    logLines.push(msg);
  }

  const evalStartTime = Date.now();

  log(`======================================================================`);
  log(`  SchemeSathi — POST /api/chat End-to-End Evaluation`);
  log(`  Endpoint: http://localhost:${PORT}/api/chat`);
  log(`  LLM Model: ${process.env.GEMINI_LLM_MODEL}`);
  log(`  Configured MIN_SIMILARITY: ${process.env.MIN_SIMILARITY || '0.86'}`);
  log(`  Per-Request Timeout: 30,000 ms`);
  log(`  Total Questions: ${questions.length}`);
  log(`======================================================================\n`);

  try {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      log(`----------------------------------------------------------------------`);
      log(`[${q.id}] [${q.category.toUpperCase()}] [Lang: ${q.language}] ${q.subCategory ? `[${q.subCategory}]` : ''}`);
      log(`Q: "${q.question}"`);

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), 30000);

      try {
        const res = await fetch(`http://localhost:${PORT}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: q.question,
            language: q.language,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutHandle);

        if (!res.ok) {
          log(`❌ HTTP Error: ${res.status} ${res.statusText}`);
          const errText = await res.text();
          log(`Body: ${errText}`);
          continue;
        }

        const data = await res.json();
        const topScore = data.topScore || 0;
        const minSim = parseFloat(process.env.MIN_SIMILARITY || '0.86');
        const firstGatePassed = topScore >= minSim;
        const llmAnswerable = Boolean(data.answerable);

        let finalDecision: ApiResult['finalDecision'] = 'Answered';
        if (!firstGatePassed) {
          finalDecision = 'Refused (Gate 1 Vector)';
        } else if (!llmAnswerable) {
          finalDecision = 'Refused (Gate 2 LLM)';
        }

        results.push({
          id: q.id,
          category: q.category,
          language: q.language,
          question: q.question,
          topScore,
          firstGatePassed,
          llmAnswerable,
          finalDecision,
          answerText: data.answer,
          citations: data.citations || [],
          latencyMs: data.latencyMs,
        });

        log(`Top Score:       ${topScore.toFixed(6)} (Gate 1: ${firstGatePassed ? 'PASSED >= 0.86' : 'BLOCKED < 0.86'})`);
        log(`Final Decision:  ${finalDecision}`);
        log(`Citations Count: ${data.citations?.length || 0}`);
        if (data.citations && data.citations.length > 0) {
          data.citations.forEach((c: any, idx: number) => {
            log(`  [Citation ${idx + 1}] ${c.schemeName} — Page ${c.pageNumber} (${c.sourceFile})`);
          });
        }
        log(`Answer Snippet:  "${data.answer.replace(/\s+/g, ' ').substring(0, 140)}..."`);
        log(`Latency:         ${data.latencyMs} ms`);
        if (data.timings) {
          log(`Stage Timings:   embed=${data.timings.embedMs}ms vectorSearch=${data.timings.vectorSearchMs}ms llm=${data.timings.llmMs ?? 0}ms`);
        }
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        if (err.name === 'AbortError') {
          log(`❌ Request TIMEOUT after 30,000 ms!`);
        } else {
          log(`❌ Request error: ${err.message}`);
        }
      }

      // Brief delay between queries to respect rate limits
      if (i < questions.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    const totalDurationMs = Date.now() - evalStartTime;

    // --- Print Final Comprehensive Table ---
    log(`\n======================================================================`);
    log(`  POST /api/chat End-to-End Benchmark Summary Table`);
    log(`======================================================================`);
    log(`ID       | Category     | Lang | Top Score | Gate 1 (Vector) | LLM Answerable | Final Decision         | Citations        | Latency`);
    log(`---------|--------------|------|-----------|-----------------|----------------|------------------------|------------------|--------`);
    for (const r of results) {
      const catLabel = r.category === 'answerable' ? 'Answerable  ' : 'Unanswerable';
      const gate1Label = r.firstGatePassed ? 'Passed (>=0.86)' : 'Blocked (<0.86)';
      const ansLabel = r.llmAnswerable ? 'true ' : 'false';
      const citesLabel = r.citations.length > 0 ? `${r.citations.length} cited (P.${r.citations.map(c => c.pageNumber).join(',')})` : '0 citations';
      log(`${r.id.padEnd(8)} | ${catLabel} | ${r.language.padEnd(4)} | ${r.topScore.toFixed(6)}  | ${gate1Label.padEnd(15)} | ${ansLabel.padEnd(14)} | ${r.finalDecision.padEnd(22)} | ${citesLabel.padEnd(16)} | ${r.latencyMs}ms`);
    }

    log(`\n----------------------------------------------------------------------`);
    log(`Total Evaluation Duration: ${(totalDurationMs / 1000).toFixed(2)} seconds (${totalDurationMs} ms)`);
    log(`Questions Evaluated:      ${results.length}/${questions.length}`);
    log(`----------------------------------------------------------------------`);

    // --- Focus Analysis on Near-Topic Leaked Questions ---
    log(`\n======================================================================`);
    log(`  Analysis: Unanswerable Questions Passing Gate 1 (MIN_SIMILARITY=0.86)`);
    log(`======================================================================`);
    const leaked = results.filter((r) => r.category === 'unanswerable' && r.firstGatePassed);
    for (const l of leaked) {
      log(`- Question [${l.id}]: "${l.question}"`);
      log(`  Top Score:       ${l.topScore.toFixed(6)} (passed vector threshold 0.86)`);
      log(`  LLM Answerable:  ${l.llmAnswerable}`);
      log(`  Final Decision:  ${l.finalDecision}`);
      log(`  Citations Count: ${l.citations.length} (must be 0 on refusal)`);
      log(`  Answer Text:     "${l.answerText}"\n`);
    }

    const outPath = path.resolve('data/processed/chat_api_eval_results.txt');
    fs.writeFileSync(outPath, logLines.join('\n'), 'utf8');
    log(`Summary written to: ${outPath}`);
  } catch (err: any) {
    console.error(`Evaluation failure: ${err.message}`);
  } finally {
    server.close();
    console.log('Test server closed.');
  }
}

runChatApiEvaluation().catch(console.error);
