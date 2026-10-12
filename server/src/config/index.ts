import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.GEMINI_API_KEY && !process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
}

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(30),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('schemesathi'),
  MONGODB_COLLECTION_NAME: z.string().default('scheme_chunks'),
  ATLAS_VECTOR_INDEX_NAME: z.string().default('vector_index'),

  // Providers
  LLM_PROVIDER: z.string().default('gemini'),
  EMBEDDING_PROVIDER: z.string().default('gemini'),

  // Gemini API
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_LLM_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(768),

  // Chunking
  CHUNK_SIZE: z.coerce.number().default(800),
  CHUNK_OVERLAP: z.coerce.number().default(120),

  // Retrieval & Guardrails
  TOP_K: z.coerce.number().default(5),
  NUM_CANDIDATES: z.coerce.number().default(100),
  MIN_SIMILARITY: z.coerce.number().default(0.65),

  // Quality gate
  MAX_GARBLE_RATE: z.coerce.number().default(5.0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid or missing environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
}

export const config = parsed.success
  ? parsed.data
  : (process.env as unknown as z.infer<typeof envSchema>);
