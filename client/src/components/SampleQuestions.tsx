import React from 'react';
import { HelpCircle, ArrowRight } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface SampleQuestionsProps {
  lang: Language;
  onSelectQuestion: (question: string) => void;
  disabled?: boolean;
}

export const SampleQuestions: React.FC<SampleQuestionsProps> = ({
  lang,
  onSelectQuestion,
  disabled,
}) => {
  const t = translations[lang];

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 mb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
        <span>{t.faqTitle}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {t.sampleQuestions.map((q, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelectQuestion(q)}
            className="text-left p-3 rounded-lg border border-slate-200/90 bg-white hover:border-blue-400 hover:bg-blue-50/40 transition-all text-xs sm:text-sm text-slate-800 flex items-start justify-between gap-2 shadow-2xs group disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="font-medium group-hover:text-blue-900 leading-snug">{q}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-transform flex-shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
};
