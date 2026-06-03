import { Injectable } from '@nestjs/common';
import { DeepLTranslationService } from './deepl-translation.service';

const SUPPORTED_LANGUAGE_CODES = {
  de: 'DE',
  en: 'EN',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
  pl: 'PL',
  ru: 'RU',
  tr: 'TR',
} as const;

type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGE_CODES;

export type TranslateTextParams = {
  text: string;
  /** Omit to let DeepL auto-detect the source language (recommended for driver messages). */
  sourceLang?: string;
  targetLang: string;
};

export type TranslationResult = {
  translatedText: string | null;
  status: 'translated' | 'failed' | 'not_requested';
  provider?: 'deepl' | 'none';
  errorMessage?: string;
  /** App language code (e.g. tr, pl) when DeepL auto-detected the source. */
  detectedSourceLang?: string;
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

  fromDeepLLang(deepLCode: string): string | null {
    const normalized = deepLCode.trim().toUpperCase().split('-')[0];
    const entry = Object.entries(SUPPORTED_LANGUAGE_CODES).find(([, code]) => code === normalized);
    return entry?.[0] ?? null;
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

    if (params.sourceLang && params.sourceLang === params.targetLang) {
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

    const sourceLang = params.sourceLang
      ? (this.toDeepLLang(params.sourceLang) ?? undefined)
      : undefined;
    const targetLang = this.toDeepLLang(params.targetLang);
    if (params.sourceLang && !sourceLang) {
      return {
        translatedText: null,
        status: 'failed',
        provider: 'none',
        errorMessage: 'Unsupported source language code',
      };
    }
    if (!targetLang) {
      return {
        translatedText: null,
        status: 'failed',
        provider: 'none',
        errorMessage: 'Unsupported target language code',
      };
    }

    const apiUrl = process.env.DEEPL_API_URL?.trim() || 'https://api-free.deepl.com/v2/translate';
    const timeoutMs = Number.parseInt(process.env.DEEPL_TIMEOUT_MS ?? '5000', 10);

    const result = await this.deepLTranslationService.translateText({
      text: normalizedText,
      sourceLang,
      targetLang,
      apiKey,
      apiUrl,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
    });

    const detectedSourceLang = result.detectedDeepLSourceLang
      ? this.fromDeepLLang(result.detectedDeepLSourceLang)
      : undefined;

    if (detectedSourceLang && detectedSourceLang === params.targetLang) {
      return {
        translatedText: null,
        status: 'not_requested',
        provider: 'none',
        detectedSourceLang,
      };
    }

    return {
      ...result,
      detectedSourceLang: detectedSourceLang ?? result.detectedSourceLang,
    };
  }
}
