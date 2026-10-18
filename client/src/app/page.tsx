'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, RefreshCw, Landmark, Sparkles, Loader2 } from 'lucide-react';
import { Language, translations } from '../i18n/translations';
import { LanguageToggle } from '../components/LanguageToggle';
import { DisclaimerNotice } from '../components/DisclaimerNotice';
import { ChatMessage, ChatMessageItem } from '../components/ChatMessage';
import { SampleQuestions } from '../components/SampleQuestions';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function Home() {
  const [lang, setLang] = useState<Language>('en');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const t = translations[lang];

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    if (query.length > 500) {
      alert(`Question must not exceed 500 characters. Currently ${query.length} characters.`);
      return;
    }

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: query,
          language: lang,
        }),
      });

      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const quotaMsg: ChatMessageItem = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: errorData.error || t.quotaError,
          isError: true,
          isQuota: true,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, quotaMsg]);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg: ChatMessageItem = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: errorData.error || t.serverError,
          isError: true,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      const data = await response.json();
      const assistantMsg: ChatMessageItem = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: data.answer || '',
        answerable: data.answerable,
        citations: data.citations || [],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const fallbackMsg: ChatMessageItem = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: t.serverError,
        isError: true,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-slate-900 tracking-tight leading-tight">
                  {t.title}
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                {t.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle currentLanguage={lang} onLanguageChange={setLang} />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
                title={t.clearButton}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t.clearButton}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mandatory Disclaimer Notice */}
      <DisclaimerNotice lang={lang} />

      {/* Main Conversation Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 flex flex-col justify-between">
        {messages.length === 0 ? (
          <div className="my-auto py-8 text-center max-w-2xl mx-auto space-y-6">
            <div className="inline-flex p-3 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 shadow-2xs mb-2">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {t.emptyStateTitle}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {t.emptyStateDescription}
              </p>
            </div>

            <div className="pt-4 text-left">
              <SampleQuestions
                lang={lang}
                onSelectQuestion={(q) => handleSendMessage(q)}
                disabled={isLoading}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 pb-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} lang={lang} />
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 shadow-2xs text-sm text-slate-600 animate-pulse my-4">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                <span>{t.loadingText}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Sticky Bottom Input Bar */}
      <footer className="sticky bottom-0 z-20 bg-white border-t border-slate-200/90 py-3 shadow-lg">
        <div className="max-w-4xl mx-auto px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative"
          >
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-300 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-xs">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.inputPlaceholder}
                rows={2}
                maxLength={500}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 resize-none px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />

              <div className="flex items-center gap-2 pb-1 pr-1">
                <span className={`text-2xs font-mono ${input.length >= 450 ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                  {input.length}/500
                </span>

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
                  aria-label={t.askButton}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </footer>
    </div>
  );
}
