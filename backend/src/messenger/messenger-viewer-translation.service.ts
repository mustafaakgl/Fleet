import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';

const SUPPORTED_LANGUAGES = new Set(['de', 'tr', 'en', 'pl', 'nl', 'it', 'es', 'ru']);

type MessageForViewerTranslation = {
  id: string;
  originalText: string;
  originalLanguage: string;
};

@Injectable()
export class MessengerViewerTranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
  ) {}

  private normalizeLanguage(language: string | null | undefined): string | null {
    if (!language) return null;
    const normalized = language.trim().toLowerCase();
    return SUPPORTED_LANGUAGES.has(normalized) ? normalized : null;
  }

  async resolveSenderLanguage(userId: string, text: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });

    const fromProfile = this.normalizeLanguage(user?.language);
    if (fromProfile) {
      return fromProfile;
    }

    if (!text.trim()) {
      return 'de';
    }

    const detected = await this.translationService.translateText({
      text,
      targetLang: 'de',
    });

    const fromDetection = this.normalizeLanguage(detected.detectedSourceLang);
    return fromDetection ?? 'de';
  }

  async getViewerTranslation(params: {
    message: MessageForViewerTranslation;
    viewerLanguage: string | null | undefined;
  }): Promise<string | null> {
    const targetLanguage = this.normalizeLanguage(params.viewerLanguage);
    if (!targetLanguage) {
      return null;
    }

    const sourceLanguage = this.normalizeLanguage(params.message.originalLanguage);
    if (!sourceLanguage || sourceLanguage === targetLanguage) {
      return null;
    }

    const cached = await this.prisma.messageTranslation.findUnique({
      where: {
        messageId_targetLanguage: {
          messageId: params.message.id,
          targetLanguage,
        },
      },
      select: {
        translatedText: true,
      },
    });

    if (cached?.translatedText) {
      return cached.translatedText;
    }

    const translation = await this.translationService.translateText({
      text: params.message.originalText,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
    });

    if (translation.status !== 'translated' || !translation.translatedText) {
      return null;
    }

    const created = await this.prisma.messageTranslation.upsert({
      where: {
        messageId_targetLanguage: {
          messageId: params.message.id,
          targetLanguage,
        },
      },
      update: {
        translatedText: translation.translatedText,
      },
      create: {
        messageId: params.message.id,
        targetLanguage,
        translatedText: translation.translatedText,
      },
      select: {
        translatedText: true,
      },
    });

    return created.translatedText;
  }

  async primeViewerTranslations(params: {
    messages: MessageForViewerTranslation[];
    viewerLanguage: string | null | undefined;
  }): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    for (const message of params.messages) {
      const translated = await this.getViewerTranslation({
        message,
        viewerLanguage: params.viewerLanguage,
      });
      result.set(message.id, translated);
    }
    return result;
  }
}
