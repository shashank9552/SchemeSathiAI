/**
 * SchemeSathi — Chat Route (POST /api/chat)
 */

import { Router } from 'express';
import { z } from 'zod';
import { ChatService } from '../rag/chatService.js';

const chatSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(1000, 'Message too long (max 1000 chars)'),
  language: z.enum(['en', 'hi']).optional(),
});

export const chatRouter = Router();
const chatService = new ChatService();

chatRouter.post('/', async (req, res) => {
  try {
    const parseResult = chatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { message, language } = parseResult.data;
    const response = await chatService.processMessage(message, language);
    return res.json(response);
  } catch (err: any) {
    const isQuota =
      err.status === 503 ||
      err.message?.includes('429') ||
      err.message?.includes('RESOURCE_EXHAUSTED') ||
      err.message?.includes('quota') ||
      err.message?.includes('high demand') ||
      err.message?.includes('अत्यधिक लोड');

    if (isQuota) {
      const userLang =
        req.body?.language === 'hi' || /[\u0900-\u097F]/.test(req.body?.message || '') ? 'hi' : 'en';
      return res.status(503).json({
        error:
          userLang === 'hi'
            ? 'सेवा पर इस समय अत्यधिक लोड है। कृपया कुछ समय बाद पुनः प्रयास करें।'
            : 'The service is currently experiencing high demand. Please try again shortly.',
      });
    }

    console.error(`[CHAT_API_ERROR] ${err.message}`);
    return res.status(500).json({
      error: 'Internal server error while processing chat message.',
    });
  }
});
