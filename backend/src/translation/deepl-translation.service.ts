import { Injectable } from '@nestjs/common';
import type { TranslateTextParams, TranslationResult } from './translation.service';

type DeepLResponse = {
  translations?: Array<{
    text?: string;
  }>;
};

@Injectable()
export class DeepLTranslationService {
  async translateText(
    params: TranslateTextParams & { apiKey: string; apiUrl: string; timeoutMs: number },
  ): Promise<TranslationResult> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const body = new URLSearchParams();
      body.set('text', params.text);
      body.set('source_lang', params.sourceLang);
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
      const translatedText = payload.translations?.[0]?.text?.trim() ?? '';
      if (!translatedText) {
        return {
          translatedText: null,
          status: 'failed',
          provider: 'deepl',
          errorMessage: 'DeepL returned empty translation',
        };
      }

      return {
        translatedText,
        status: 'translated',
        provider: 'deepl',
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
