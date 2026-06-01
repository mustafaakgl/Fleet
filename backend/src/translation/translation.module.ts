import { Module } from '@nestjs/common';
import { DeepLTranslationService } from './deepl-translation.service';
import { TranslationService } from './translation.service';

@Module({
  providers: [TranslationService, DeepLTranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
