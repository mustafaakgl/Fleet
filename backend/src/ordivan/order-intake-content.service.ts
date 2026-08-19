import { Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { extractUnsafeText } from './core/intake-file';

/**
 * MESAJ ICERIGI OKUYUCU (Faz 16).
 *
 * NEDEN AYRI BIR SAGLAYICI: iki taraf ayni icerigi okumak zorunda —
 *
 *   1. Connector ucu: worker cikarim yapabilmek icin metni cekiyor.
 *   2. `AutomationJobService`: is tamamlandiginda KONTROLLERI sunucu
 *      yeniden uretiyor ve bunu SAKLANAN icerikten yapmasi gerekiyor.
 *
 * Ikisi de `OrderIntakeService` uzerinden okusaydi dairesel bir bagimlilik
 * olusurdu (`OrderIntakeService` zaten `AutomationJobService`e bagli). Ayni
 * okuma mantigini iki yere kopyalamak ise zamanla iki farkli "icerik" tanimi
 * uretirdi — ve kontroller ile cikarim farkli metinlere bakmaya baslardi.
 *
 * DONEN METIN GUVENSIZDIR. Yalnizca kalip eslestirmesi icin kullanilmali;
 * talimat olarak yorumlanmaz, denetime ve loglara yazilmaz.
 */
export interface OrderIntakeContent {
  messageId: string;
  subject: string | null;
  bodyText: string | null;
  /** Kabul edilen eklerin metinleri. Reddedilen ek BURADA YOKTUR. */
  attachmentTexts: string[];
}

@Injectable()
export class OrderIntakeContentService {
  constructor(private readonly prisma: PrismaService) {}

  async contentForExtraction(messageId: string): Promise<OrderIntakeContent> {
    const message = await this.prisma.orderIntakeMessage.findFirst({
      where: { id: messageId },
      select: {
        id: true,
        subject: true,
        bodyText: true,
        attachments: {
          // REDDEDILEN EK CIKARIMA GIRMEZ: dogrulamadan gecmemis bir dosyanin
          // metnini okumak, tam da o dogrulamanin engelledigi seydir.
          where: { rejectionCode: null },
          orderBy: { createdAt: 'asc' },
          select: {
            intake: {
              select: { pageCount: true, artifact: { select: { storedFileName: true } } },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({ code: 'order_intake_message_not_found' });
    }

    const attachmentTexts: string[] = [];
    for (const attachment of message.attachments) {
      const stored = attachment.intake?.artifact.storedFileName;
      if (!stored) continue;
      try {
        const buffer = await readFile(join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, stored));
        const text = extractUnsafeText(buffer, attachment.intake!.pageCount);
        attachmentTexts.push([...text.pages, text.metadata].join('\n'));
      } catch {
        // Okunamayan ek cikarimi DURDURMAZ: eksik metin, uydurulmus metinden
        // iyidir. Bos metin `unknown` bir sonuca yol acar, yanlis bir sonuca degil.
        attachmentTexts.push('');
      }
    }

    return {
      messageId: message.id,
      subject: message.subject,
      bodyText: message.bodyText,
      attachmentTexts,
    };
  }
}
