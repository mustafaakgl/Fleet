import { Injectable } from '@nestjs/common';
import { DeepLTranslationService } from './deepl-translation.service';

const SUPPORTED_LANGUAGE_CODES = {
  de: 'DE',
  en: 'EN',
  tr: 'TR',
} as const;

type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGE_CODES;

export type TranslateTextParams = {
  text: string;
  sourceLang: string;
  targetLang: string;
};

export type TranslationResult = {
  translatedText: string | null;
  status: 'translated' | 'failed' | 'not_requested';
  provider?: 'deepl' | 'none';
  errorMessage?: string;
};

@Injectable()
export class TranslationService {
  constructor(private readonly deepLTranslationService: DeepLTranslationService) {}

  private isEnabled(): boolean {
    return (process.env.MESSENGER_TRANSLATION_ENABLED ?? 'true').toLowerCase() === 'true';
  }

  private toDeepLLang(language: string): string | null {
    return SUPPORTED_LANGUAGE_CODES[language as SupportedLanguage] ?? null;
  }

  async translateText(params: TranslateTextParams): Promise<TranslationResult> {
    const normalizedText = params.text.trim();
    if (!normalizedText) {
      return {
        translatedText: null,
        status: 'not_requested',
        provider: 'none',
      };
    }

    if (!params.targetLang) {
      return {
        translatedText: null,
        status: 'not_requested',
        provider: 'none',
      };
    }

    if (params.sourceLang === params.targetLang) {
      return {
        translatedText: null,
        status: 'not_requested',
        provider: 'none',
      };
    }

    if (!this.isEnabled()) {
      return {
        translatedText: null,
        status: 'not_requested',
        provider: 'none',
      };
    }

    const apiKey = process.env.DEEPL_API_KEY?.trim();
    if (!apiKey) {
      return {
        translatedText: null,
        status: 'failed',
        provider: 'none',
        errorMessage: 'DEEPL_API_KEY is missing',
      };
    }

    const sourceLang = this.toDeepLLang(params.sourceLang);
    const targetLang = this.toDeepLLang(params.targetLang);
    if (!sourceLang || !targetLang) {
      return {
        translatedText: null,
        status: 'failed',
        provider: 'none',
        errorMessage: 'Unsupported language code',
      };
    }

    const apiUrl = process.env.DEEPL_API_URL?.trim() || 'https://api-free.deepl.com/v2/translate';
    const timeoutMs = Number.parseInt(process.env.DEEPL_TIMEOUT_MS ?? '5000', 10);

    return this.deepLTranslationService.translateText({
      text: normalizedText,
      sourceLang,
      targetLang,
      apiKey,
      apiUrl,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
    });
  }
}
