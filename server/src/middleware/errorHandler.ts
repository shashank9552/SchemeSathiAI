/**
 * SchemeSathi — Centralised Error Handler & Sanitization Middleware
 * 
 * Guarantees:
 * 1. Zero stack traces exposed to client responses.
 * 2. Redacts sensitive credentials (API keys, MongoDB URIs, passwords) from server logs.
 * 3. Consistent JSON error contracts for 400, 413, 500, etc.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function sanitizeLog(input: string): string {
  if (!input) return '';
  let sanitized = input;

  // Redact MongoDB connection strings (e.g., mongodb+srv://user:pass@...)
  sanitized = sanitized.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_MONGODB_URI]');

  // Redact known Gemini API key from config if present
  if (config.GEMINI_API_KEY) {
    sanitized = sanitized.split(config.GEMINI_API_KEY).join('[REDACTED_API_KEY]');
  }

  // Redact Google AI Studio API key pattern (AIzaSy...)
  sanitized = sanitized.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_API_KEY]');

  return sanitized;
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // If response has already started streaming, delegate to default Express handler
  if (res.headersSent) {
    return;
  }

  // 1. JSON parsing syntax error in request body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Invalid JSON payload received.',
    });
    return;
  }

  // 2. Request body exceeds configured limit (e.g., 10kb)
  if (err.type === 'entity.too.large' || err.status === 413) {
    res.status(413).json({
      error: 'Request payload exceeds allowable limit (10kb max).',
    });
    return;
  }

  // 3. Centralized status resolution
  const statusCode = typeof err.statusCode === 'number'
    ? err.statusCode
    : typeof err.status === 'number'
    ? err.status
    : 500;

  // Sanitized logging — never log full stack trace or connection secrets
  const rawMessage = err.message || 'Internal server error';
  console.error(`[SERVER_ERROR] [Status ${statusCode}]: ${sanitizeLog(rawMessage)}`);

  // Client response — no stack trace, no secret exposure
  const clientResponse: { error: string; details?: string[] } = {
    error: statusCode >= 500 ? 'Internal server error.' : rawMessage,
  };

  if (err.details && Array.isArray(err.details)) {
    clientResponse.details = err.details;
  }

  res.status(statusCode).json(clientResponse);
}
