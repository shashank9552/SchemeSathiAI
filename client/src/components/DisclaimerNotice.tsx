import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface DisclaimerNoticeProps {
  lang: Language;
}

export const DisclaimerNotice: React.FC<DisclaimerNoticeProps> = ({ lang }) => {
  const t = translations[lang];

  return (
    <div className="w-full bg-amber-50 border-y border-amber-200/80 px-4 py-2.5 text-xs sm:text-sm text-amber-900 flex items-center justify-center gap-2">
      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className="font-medium text-center">
        {t.disclaimer}
      </span>
    </div>
  );
};
