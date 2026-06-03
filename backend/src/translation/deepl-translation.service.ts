import { Injectable } from '@nestjs/common';
import type { TranslateTextParams, TranslationResult } from './translation.service';

type DeepLResponse = {
  translations?: Array<{
    text?: string;
    detected_source_language?: string;
  }>;
};

export type DeepLTranslateParams = TranslateTextParams & {
  apiKey: string;
  apiUrl: string;
  timeoutMs: number;
  /** DeepL language code (e.g. PL). Omit to auto-detect. */
  sourceLang?: string;
  targetLang: string;
};

@Injectable()
export class DeepLTranslationService {
  async translateText(params: DeepLTranslateParams): Promise<TranslationResult & { detectedDeepLSourceLang?: string }> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const body = new URLSearchParams();
      body.set('text', params.text);
      if (params.sourceLang) {
        body.set('source_lang', params.sourceLang);
      }
      body.set('target_lang', params.targetLang);

      const response = await fetch(params.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${params.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          translatedText: null,
          status: 'failed',
          provider: 'deepl',
          errorMessage: `DeepL request failed with status ${response.status}`,
        };
      }

      const payload = (await response.json()) as DeepLResponse;
      const firstTranslation = payload.translations?.[0];
      const translatedText = firstTranslation?.text?.trim() ?? '';
      const detectedDeepLSourceLang = firstTranslation?.detected_source_language?.trim();

      if (!translatedText) {
        return {
          translatedText: null,
          status: 'failed',
          provider: 'deepl',
          errorMessage: 'DeepL returned empty translation',
          detectedDeepLSourceLang,
        };
      }

      return {
        translatedText,
        status: 'translated',
        provider: 'deepl',
        detectedDeepLSourceLang,
      };
    } catch (error) {
      return {
        translatedText: null,
        status: 'failed',
        provider: 'deepl',
        errorMessage: error instanceof Error ? error.message : 'DeepL request failed',
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
