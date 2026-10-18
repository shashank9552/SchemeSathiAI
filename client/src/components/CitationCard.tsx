'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Bookmark } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

export interface CitationData {
  schemeName: string;
  sourceFile: string;
  pageNumber: number;
  excerpt: string;
}

interface CitationCardProps {
  citation: CitationData;
  lang: Language;
  index: number;
}

export const CitationCard: React.FC<CitationCardProps> = ({ citation, lang, index }) => {
  const [isOpen, setIsOpen] = useState(false);
  const t = translations[lang];

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden transition-all duration-200">
      <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200/60">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <Bookmark className="w-4 h-4 text-blue-700 flex-shrink-0" />
          <span className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
            [{index + 1}] {citation.schemeName}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 border border-blue-200/50">
            <FileText className="w-3 h-3" />
            {t.pageLabel} {citation.pageNumber}
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-700 p-1 rounded hover:bg-slate-200/60 transition-colors"
            aria-expanded={isOpen}
          >
            <span className="hidden sm:inline">
              {isOpen ? t.hideExcerpt : t.showExcerpt}
            </span>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 text-xs text-slate-500 bg-slate-50/50 flex items-center justify-between">
        <span className="truncate">
          <span className="font-medium text-slate-600">{t.documentLabel}:</span> {citation.sourceFile}
        </span>
      </div>

      {isOpen && (
        <div className="p-3 bg-white text-xs sm:text-sm text-slate-700 border-t border-slate-100">
          <div className="font-medium text-slate-500 mb-1 flex items-center gap-1 text-xs">
            <span>{t.excerptLabel}:</span>
          </div>
          <div className="bg-slate-50 rounded p-2.5 border border-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-800">
            {citation.excerpt}
          </div>
        </div>
      )}
    </div>
  );
};
