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
    console.error(`[CHAT_API_ERROR] ${err.message}`);
    return res.status(500).json({
      error: 'Internal server error while processing chat message.',
    });
  }
});
