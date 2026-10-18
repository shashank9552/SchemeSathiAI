import React from 'react';
import { Languages } from 'lucide-react';
import { Language } from '../i18n/translations';

interface LanguageToggleProps {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  currentLanguage,
  onLanguageChange,
}) => {
  return (
    <div className="inline-flex items-center rounded-lg bg-slate-100 p-1 border border-slate-200">
      <Languages className="w-4 h-4 ml-1.5 mr-1 text-slate-500" />
      <button
        type="button"
        onClick={() => onLanguageChange('en')}
        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
          currentLanguage === 'en'
            ? 'bg-blue-700 text-white shadow-sm'
            : 'text-slate-700 hover:text-slate-900'
        }`}
        aria-pressed={currentLanguage === 'en'}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => onLanguageChange('hi')}
        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
          currentLanguage === 'hi'
            ? 'bg-blue-700 text-white shadow-sm'
            : 'text-slate-700 hover:text-slate-900'
        }`}
        aria-pressed={currentLanguage === 'hi'}
      >
        हिन्दी
      </button>
    </div>
  );
};
