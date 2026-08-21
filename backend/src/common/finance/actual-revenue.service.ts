import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { matchesBaseCurrency, normalizeCurrency } from '../utils/currency';
import { ACTUAL_REVENUE_INVOICE_STATUSES, invoiceRevenueSign } from './recognition';

/**
 * GERCEK gelir — TEK okuma yolu.
 *
 * NEDEN AYRI BIR SERVIS: gerceklesen gelir bes ayri ekranda gosteriliyor
 * (gunluk pano, maliyet panosu, arac maliyetleri, grafikler, haftali sirket
 * kirilimi). Fatura filtresini her birine ayri yazmak, birinin `draft`i ya da
 * `cancelled`i unutmasi demekti; unutulmus bir durum, HATA VERMEDEN yanlis
 * bir gelir rakami uretir.
 *
 * KAYNAK `InvoiceLine`, `Invoice` DEGIL: gelirin araca ve sirkete
 * baglanabilmesi icin satir duzeyi gerekiyor. Bir faturada birden fazla
 * aracin gorevi olabilir; fatura basligini tek araca yazmak toplamlari
 * kaydirirdi.
 *
 * NET tutar toplaniyor, brut DEGIL: KDV gelir degildir, devlet adina tahsil
 * edilen bir tutardir.
 */
export interface ActualRevenueRow {
  /** Gorev uzerinden cozulen arac. Satir bir goreve bagli degilse `null`. */
  vehicleId: string | null;
  companyId: string;
  /** Donem olcutu: hizmet tarihi, yoksa fatura tarihi. */
  at: Date;
  /** Isareti VERILMIS tutar (alacak dekontu / iptal faturasi EKSI). */
  amount: number;
  currency: string;
}

export interface ActualRevenueCollection {
  /** YALNIZCA temel para birimindeki satirlar. */
  rows: ActualRevenueRow[];
  /** Temel para birimi disindakiler — toplama KATILMADI, silinmedi. */
  unconvertedByCurrency: Array<{ currency: string; amount: number; count: number }>;
  /** Bir goreve bagli olmayan satirlarin toplami: araca yazilamaz. */
  withoutVehicleAmount: number;
  withoutVehicleCount: number;
}

@Injectable()
export class ActualRevenueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `[from, to)` araligindaki gerceklesen geliri okur.
   *
   * DONEM OLCUTU `serviceDate`, fatura tarihi DEGIL — hizmetin gercekten
   * verildigi ay. Yakittaki `enteredAt` karariyla ayni: gec kesilen bir
   * fatura ait oldugu aya yazilmali, yoksa donemler faturalama hizina gore
   * kayar. `serviceDate` bos olan satirlarda fatura tarihine DUSULUYOR —
   * uydurulmus bir tarih degil, belgenin kendi tarihi.
   */
  async collect(
    from: Date,
    to: Date,
    baseCurrency: string,
    filter: { vehicleId?: string } = {},
  ): Promise<ActualRevenueCollection> {
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      status: { in: ACTUAL_REVENUE_INVOICE_STATUSES },
    };

    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: invoiceWhere,
        ...(filter.vehicleId ? { assignment: { vehicleId: filter.vehicleId } } : {}),
        OR: [
          { serviceDate: { gte: from, lt: to } },
          {
            serviceDate: null,
            invoice: { ...invoiceWhere, invoiceDate: { gte: from, lt: to } },
          },
        ],
      },
      select: {
        netCents: true,
        serviceDate: true,
        assignment: { select: { vehicleId: true } },
        invoice: {
          select: { invoiceDate: true, currency: true, companyId: true, kind: true },
        },
      },
    });

    const rows: ActualRevenueRow[] = [];
    const unconverted = new Map<string, { amount: number; count: number }>();
    let withoutVehicleAmount = 0;
    let withoutVehicleCount = 0;

    for (const line of lines) {
      // Cents -> ana birim. Toplama cents uzerinde yapilsaydi bile disariya
      // ayni sayi cikardi; burada cevirmek, tuketicilerin hepsinin ayni
      // olcegi gormesini sagliyor.
      const amount = (line.netCents / 100) * invoiceRevenueSign(line.invoice.kind);
      const currency = normalizeCurrency(line.invoice.currency) ?? baseCurrency;
      const at = line.serviceDate ?? line.invoice.invoiceDate;

      if (!matchesBaseCurrency(currency, baseCurrency)) {
        const bucket = unconverted.get(currency) ?? { amount: 0, count: 0 };
        bucket.amount = Number((bucket.amount + amount).toFixed(2));
        bucket.count += 1;
        unconverted.set(currency, bucket);
        continue;
      }

      const vehicleId = line.assignment?.vehicleId ?? null;
      if (vehicleId === null) {
        withoutVehicleAmount = Number((withoutVehicleAmount + amount).toFixed(2));
        withoutVehicleCount += 1;
      }

      rows.push({
        vehicleId,
        companyId: line.invoice.companyId,
        at,
        amount,
        currency,
      });
    }

    return {
      rows,
      unconvertedByCurrency: [...unconverted.entries()]
        .map(([currency, bucket]) => ({ currency, ...bucket }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
      withoutVehicleAmount,
      withoutVehicleCount,
    };
  }

  /** Araligin TEK sayilik toplami — kirilim gerekmeyen cagiranlar icin. */
  async total(from: Date, to: Date, baseCurrency: string): Promise<number> {
    const collected = await this.collect(from, to, baseCurrency);
    return Number(collected.rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
  }
}
