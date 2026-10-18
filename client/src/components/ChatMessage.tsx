'use client';

import React from 'react';
import { User, ShieldAlert, Sparkles, BookOpen } from 'lucide-react';
import { CitationCard, CitationData } from './CitationCard';
import { Language, translations } from '../i18n/translations';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  answerable?: boolean;
  citations?: CitationData[];
  isError?: boolean;
  isQuota?: boolean;
  timestamp: Date;
}

interface ChatMessageProps {
  message: ChatMessageItem;
  lang: Language;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, lang }) => {
  const isUser = message.role === 'user';
  const t = translations[lang];

  if (isUser) {
    return (
      <div className="flex justify-end my-3">
        <div className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]">
          <div className="bg-blue-700 text-white rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-xs text-sm sm:text-base leading-relaxed break-words">
            {message.content}
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-200">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant response
  return (
    <div className="flex justify-start my-4">
      <div className="flex items-start gap-2.5 max-w-[95%] sm:max-w-[85%] w-full">
        <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
          <Sparkles className="w-4 h-4" />
        </div>

        <div className="flex-1 space-y-3">
          {/* Main Answer Card */}
          <div
            className={`rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-xs border leading-relaxed text-sm sm:text-base ${
              message.isError
                ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                : message.answerable === false
                ? 'bg-amber-50/50 border-amber-200 text-slate-800'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Friendly Refusal Banner if ungrounded / not in corpus */}
            {message.answerable === false && (
              <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-amber-100/70 text-amber-900 text-xs font-medium border border-amber-300/60">
                <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <span>{t.refusalNotice}</span>
              </div>
            )}

            {/* Error Banner */}
            {message.isError && (
              <div className="mb-2 flex items-center gap-2 text-rose-700 font-semibold text-xs sm:text-sm">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{message.isQuota ? t.quotaError : t.serverError}</span>
              </div>
            )}

            {/* Text Content */}
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          </div>

          {/* Grounded Citations (only when answerable is true and citations exist) */}
          {message.answerable !== false && message.citations && message.citations.length > 0 && (
            <div className="space-y-2 pt-1 pl-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <BookOpen className="w-3.5 h-3.5 text-blue-700" />
                <span>{t.citationsTitle} ({message.citations.length})</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {message.citations.map((cite, idx) => (
                  <CitationCard
                    key={`${cite.sourceFile}-${cite.pageNumber}-${idx}`}
                    citation={cite}
                    lang={lang}
                    index={idx}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
