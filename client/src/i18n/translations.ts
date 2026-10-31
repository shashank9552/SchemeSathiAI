export type Language = 'en' | 'hi';

export type RefusalReason =
  | 'below_threshold'
  | 'llm_not_answerable'
  | 'ungrounded_number'
  | 'llm_error'
  | 'quota_error';

export interface TranslationStrings {
  title: string;
  tagline: string;
  badge: string;
  disclaimer: string;
  inputPlaceholder: string;
  askButton: string;
  clearButton: string;
  faqTitle: string;
  loadingText: string;
  citationsTitle: string;
  schemeLabel: string;
  documentLabel: string;
  pageLabel: string;
  excerptLabel: string;
  showExcerpt: string;
  hideExcerpt: string;
  refusalNotice: string;
  refusalNoticeBelowThreshold: string;
  refusalNoticeNotCovered: string;
  refusalNoticeUngroundedNumber: string;
  refusalNoticeError: string;
  belowThresholdMessage: string;
  notCoveredMessage: string;
  genericErrorMessage: string;
  serverError: string;
  quotaError: string;
  charCount: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  sampleQuestions: string[];
}

export const translations: Record<Language, TranslationStrings> = {
  en: {
    title: 'SchemeSathi',
    tagline: 'Official Government Welfare Schemes Assistant',
    badge: 'Answers cite official documents',
    disclaimer: 'SchemeSathi gives guidance from official documents only. Always confirm details on the official government portal.',
    inputPlaceholder: 'Ask about MSME schemes, eligibility, subsidies, loans (up to 500 characters)...',
    askButton: 'Ask Question',
    clearButton: 'New Chat',
    faqTitle: 'Frequently Asked Questions',
    loadingText: 'Searching verified official documents & grounding answer...',
    citationsTitle: 'Official Sources & Citations',
    schemeLabel: 'Scheme',
    documentLabel: 'Document',
    pageLabel: 'Page',
    excerptLabel: 'Official Text Excerpt',
    showExcerpt: 'View Excerpt',
    hideExcerpt: 'Hide Excerpt',
    refusalNotice: 'Information Not Covered in Official Documents',
    refusalNoticeBelowThreshold: 'No Close Match in Official Documents',
    refusalNoticeNotCovered: 'Information Not Covered in Official Documents',
    refusalNoticeUngroundedNumber: 'Numerical Verification Notice',
    refusalNoticeError: 'System Notice: Something went wrong',
    belowThresholdMessage: "I couldn't find a close match. Try adding your age, occupation, and what you want (loan, training, subsidy).",
    notCoveredMessage: 'This information is not covered in the available official documents.',
    genericErrorMessage: 'Something went wrong, please try again.',
    serverError: 'Unable to connect to SchemeSathi server. Please verify the API is running at NEXT_PUBLIC_API_URL.',
    quotaError: 'The service is currently experiencing high demand. Please try again shortly.',
    charCount: 'chars',
    emptyStateTitle: 'How can SchemeSathi assist you today?',
    emptyStateDescription: 'Ask any question in English or हिन्दी about Indian MSME schemes, credit guarantees, subsidies, or eligibility criteria.',
    sampleQuestions: [
      'Who is eligible for PMEGP loan and what is the age limit?',
      'What is the collateral-free guarantee under CGTMSE for women entrepreneurs?',
      'What is the Entrepreneurship Awareness Programme and who is it for?',
      'What financial assistance and toolkit incentive is provided under PM Vishwakarma?',
    ],
  },
  hi: {
    title: 'योजनासाथी',
    tagline: 'आधिकारिक सरकारी कल्याणकारी योजना सहायक',
    badge: 'उत्तर आधिकारिक दस्तावेजों को उद्धृत करते हैं',
    disclaimer: 'SchemeSathi gives guidance from official documents only. Always confirm details on the official government portal.',
    inputPlaceholder: 'MSME योजनाओं, पात्रता, सब्सिडी, ऋण के बारे में पूछें (अधिकतम 500 अक्षर)...',
    askButton: 'प्रश्न पूछें',
    clearButton: 'नई बातचीत',
    faqTitle: 'अक्सर पूछे जाने वाले प्रश्न',
    loadingText: 'आधिकारिक दस्तावेजों में खोज और उत्तर तैयार किया जा रहा है...',
    citationsTitle: 'आधिकारिक स्रोत एवं संदर्भ',
    schemeLabel: 'योजना',
    documentLabel: 'दस्तावेज',
    pageLabel: 'पृष्ठ',
    excerptLabel: 'आधिकारिक उद्धरण',
    showExcerpt: 'उद्धरण देखें',
    hideExcerpt: 'उद्धरण छिपाएं',
    refusalNotice: 'यह जानकारी आधिकारिक विवरणिका में शामिल नहीं है',
    refusalNoticeBelowThreshold: 'आधिकारिक दस्तावेजों में कोई करीबी मिलान नहीं मिला',
    refusalNoticeNotCovered: 'यह जानकारी आधिकारिक विवरणिका में शामिल नहीं है',
    refusalNoticeUngroundedNumber: 'संख्यात्मक विवरणिका सत्यापन में असमर्थ',
    refusalNoticeError: 'तकनीकी समस्या: कुछ गलत हो गया',
    belowThresholdMessage: 'मुझे कोई सटीक मिलान नहीं मिला। कृपया अपनी आयु, व्यवसाय और अपनी आवश्यकता (ऋण, प्रशिक्षण, सब्सिडी) जोड़कर पुनः प्रयास करें।',
    notCoveredMessage: 'यह जानकारी उपलब्ध आधिकारिक विवरणिका में शामिल नहीं है।',
    genericErrorMessage: 'कुछ गलत हो गया, कृपया पुनः प्रयास करें।',
    serverError: 'योजनासाथी सर्वर से कनेक्ट करने में असमर्थ। कृपया जांचें कि बैकएंड सर्वर चल रहा है।',
    quotaError: 'सेवा पर इस समय अत्यधिक लोड है। कृपया कुछ समय बाद पुनः प्रयास करें।',
    charCount: 'अक्षर',
    emptyStateTitle: 'योजनासाथी आपकी क्या सहायता कर सकता है?',
    emptyStateDescription: 'भारतीय MSME योजनाओं, क्रेडिट गारंटी, सब्सिडी या पात्रता मानदंडों के बारे में अंग्रेज़ी या हिन्दी में प्रश्न पूछें।',
    sampleQuestions: [
      'PMEGP योजना के तहत कौन आवेदन कर सकता है और आयु सीमा क्या है?',
      'महिला उद्यमियों के लिए CGTMSE के तहत ऋण गारंटी सीमा क्या है?',
      'उद्यमिता जागरूकता कार्यक्रम (EAP) क्या है और यह किसके लिए है?',
      'पीएम विश्वकर्मा योजना के तहत टूलकिट प्रोत्साहन और ऋण सहायता क्या है?',
    ],
  },
};
