import { Injectable, Logger } from '@nestjs/common';
import { FuelProductType } from '@prisma/client';
import { FuelStationCacheService } from './fuel-station-cache.service';
import type {
  FuelStationOffering,
  FuelStationProvider,
  FuelStationResult,
  FuelStationSearchQuery,
  NormalizedFuelStation,
} from './fuel-station.types';

/**
 * Sablon istasyon. Koordinat ve mesafe cagri aninda merkeze gore hesaplanir;
 * burada yalnizca merkeze GORE ofset ve sabit ozellikler duruyor.
 *
 * Senaryolar bilincli olarak cesitli: acik/kapali, fiyati olan/olmayan ve
 * Diesel/E5/E10'un farkli kombinasyonlari. Boylece surucu ekrani "hepsi ayni"
 * bir listeyle degil, gercekte karsilasacagi durumlarla sinaniyor.
 */
interface MockStationTemplate {
  id: string;
  name: string;
  brand: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  /** Merkeze gore kuzey/dogu ofseti (km). Mesafe bundan turuyor. */
  offsetNorthKm: number;
  offsetEastKm: number;
  isOpen: boolean;
  /** null = saglayici o urun icin fiyat vermiyor; alan hic yok = urun satilmiyor. */
  diesel?: number | null;
  e5?: number | null;
  e10?: number | null;
}

/**
 * Deterministik sablonlar. Sira ve degerler SABIT — rastgelelik yok, cunku
 * "her yenilemede baska fiyat" bir demo verisi degil, hata ayiklanamaz bir
 * ekran uretir. Ofsetler 0.4 km ile 22 km arasina yayildi ki yaricap filtresi
 * gercekten sinanabilsin.
 */
const MOCK_STATION_TEMPLATES: readonly MockStationTemplate[] = [
  {
    id: 'mock-aral-hafen',
    name: 'Aral Hafenstraße',
    brand: 'ARAL',
    street: 'Hafenstraße',
    houseNumber: '12',
    postalCode: '47059',
    city: 'Duisburg',
    offsetNorthKm: 0.4,
    offsetEastKm: 0.2,
    isOpen: true,
    diesel: 1.719,
    e5: 1.879,
    e10: 1.819,
  },
  {
    id: 'mock-shell-nord',
    name: 'Shell Nordring',
    brand: 'Shell',
    street: 'Nordring',
    houseNumber: '4',
    postalCode: '47051',
    city: 'Duisburg',
    offsetNorthKm: 1.8,
    offsetEastKm: -0.9,
    isOpen: true,
    diesel: 1.699,
    e10: 1.799,
  },
  {
    // Kapali istasyon: fiyati var ama surucu suan tanklayamaz.
    id: 'mock-esso-sued',
    name: 'Esso Südtor',
    brand: 'Esso',
    street: 'Südstraße',
    houseNumber: '88',
    postalCode: '47053',
    city: 'Duisburg',
    offsetNorthKm: -2.6,
    offsetEastKm: 1.4,
    isOpen: false,
    diesel: 1.689,
    e5: 1.859,
  },
  {
    // Fiyati BILINMEYEN istasyon: siralamada ucuz sayilmamali.
    id: 'mock-freie-tankstelle',
    name: 'Freie Tankstelle Ruhrort',
    brand: 'Freie Tankstelle',
    street: 'Ruhrorter Straße',
    houseNumber: '203',
    postalCode: '47059',
    city: 'Duisburg',
    offsetNorthKm: 3.4,
    offsetEastKm: 2.1,
    isOpen: true,
    diesel: null,
    e10: null,
  },
  {
    // Yalnizca benzin: dizel araca hic gorunmemeli.
    id: 'mock-total-benzin',
    name: 'TotalEnergies Innenstadt',
    brand: 'TotalEnergies',
    street: 'Königstraße',
    houseNumber: '17',
    postalCode: '47051',
    city: 'Duisburg',
    offsetNorthKm: -4.2,
    offsetEastKm: -3.1,
    isOpen: true,
    e5: 1.849,
    e10: 1.789,
  },
  {
    // En ucuz dizel ama uzakta: "en ucuz" ile "en yakin" etiketleri ayrisir.
    id: 'mock-autohof-a40',
    name: 'Autohof A40',
    brand: 'Raststätte',
    street: 'Autobahnzubringer',
    houseNumber: '1',
    postalCode: '46047',
    city: 'Oberhausen',
    offsetNorthKm: 9.6,
    offsetEastKm: 6.3,
    isOpen: true,
    diesel: 1.649,
    e5: 1.829,
    e10: 1.769,
  },
  {
    // YALNIZCA dizel — kamyon filosu icin cok gercek bir durum (LKW-Tankstelle).
    // Benzinli bir arac icin bu istasyon listeden tamamen dusmeli.
    // Ayrica yaricap sinirinin dis kenarinda: 5/10/15 km secimlerinde DUSMELI.
    id: 'mock-fernstation',
    name: 'LKW-Station Niederrhein',
    brand: 'Freie Tankstelle',
    street: 'Niederrheinallee',
    houseNumber: '340',
    postalCode: '47506',
    city: 'Neukirchen-Vluyn',
    offsetNorthKm: 18.2,
    offsetEastKm: -12.4,
    isOpen: true,
    diesel: 1.629,
  },
];

/** Enlem/boylam basina yaklasik km — Almanya enlemleri icin yeterli. */
const KM_PER_DEGREE_LAT = 111.2;

/**
 * Ag baglantisi OLMAYAN, deterministik yakit istasyonu saglayicisi.
 *
 * Neden var: gercek Tankerkonig anahtari henuz yok ama surucu ekraninin uctan
 * uca calisabilmesi gerekiyor. Tankerkonig'in demo anahtari KULLANILMIYOR —
 * baskasinin kotasini harcamak ve lisansli veriyi test icin cekmek dogru degil.
 *
 * SINIRLARI:
 *   - hicbir dis cagri yapmaz (fetch YOK),
 *   - veritabanina yazmaz,
 *   - arac uyumlulugu filtresini KOPYALAMAZ; filtreleme FuelStationService'te
 *     kaliyor, boylece mock ve live ayni kuraldan geciyor.
 *
 * Uretimde secilmesi ONLENIR: bkz. resolveFuelStationProviderKind
 * (fuel-station-provider.config.ts) ve validateEnv.
 */
@Injectable()
export class MockFuelStationProvider implements FuelStationProvider {
  readonly name = 'mock';

  readonly dataMode = 'mock' as const;

  /**
   * Atif metni saglayici adini DEGIL demo oldugunu soyluyor: surucuye
   * "Tankerkonig" yazip sahte fiyat gostermek yanlis guven yaratir. Arayuz
   * ayrica dataMode='mock' gorunce kendi uyari bandini aciyor.
   */
  readonly attribution = {
    label: 'Demodaten',
    url: null,
  } as const;

  private readonly logger = new Logger(MockFuelStationProvider.name);

  constructor(private readonly cache: FuelStationCacheService) {}

  /** Mock her zaman hazir: anahtar gerektirmiyor. */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Live saglayiciyla AYNI urun kumesi.
   *
   * Bilincli: mock'un daha fazla urun "destekledigi" bir dunya, gercek
   * anahtara gecildiginde sessizce kaybolan ozellikler demek olurdu. HVO100
   * kabul eden bir arac her iki modda da ayni uyariyi gorur.
   */
  supportedProducts(): readonly FuelProductType[] {
    return [FuelProductType.DIESEL, FuelProductType.SUPER_E5, FuelProductType.SUPER_E10];
  }

  private cacheKey(query: FuelStationSearchQuery): string {
    const lat = query.latitude.toFixed(3);
    const lng = query.longitude.toFixed(3);
    return `${this.name}:${lat}:${lng}:${query.radiusKm.toFixed(1)}`;
  }

  private toOfferings(template: MockStationTemplate): FuelStationOffering[] {
    const candidates: Array<{ productType: FuelProductType; price?: number | null }> = [
      { productType: FuelProductType.DIESEL, price: template.diesel },
      { productType: FuelProductType.SUPER_E5, price: template.e5 },
      { productType: FuelProductType.SUPER_E10, price: template.e10 },
    ];

    const offerings: FuelStationOffering[] = [];
    for (const candidate of candidates) {
      // Alan hic tanimli degilse istasyon o urunu satmiyor -> teklif kurulmaz.
      if (candidate.price === undefined) {
        continue;
      }
      offerings.push({
        productType: candidate.productType,
        pricePerUnit: candidate.price,
        unit: 'liter',
        currency: 'EUR',
        // Live saglayici da fiyat zamani vermiyor; mock uydurmuyor ki iki mod
        // arasinda arayuz farki olusmasin.
        updatedAt: null,
      });
    }

    return offerings;
  }

  /** Ofsetten gercek koordinat ve merkeze kus ucusu mesafe. */
  private placeStation(
    template: MockStationTemplate,
    query: FuelStationSearchQuery,
  ): { latitude: number; longitude: number; distanceKm: number } {
    const kmPerDegreeLon = KM_PER_DEGREE_LAT * Math.cos((query.latitude * Math.PI) / 180);
    const latitude = query.latitude + template.offsetNorthKm / KM_PER_DEGREE_LAT;
    const longitude =
      query.longitude + (kmPerDegreeLon === 0 ? 0 : template.offsetEastKm / kmPerDegreeLon);
    const distanceKm = Math.sqrt(template.offsetNorthKm ** 2 + template.offsetEastKm ** 2);

    return {
      latitude,
      longitude,
      distanceKm: Math.round(distanceKm * 10) / 10,
    };
  }

  async search(
    query: FuelStationSearchQuery,
  ): Promise<FuelStationResult<NormalizedFuelStation[]>> {
    const cacheKey = this.cacheKey(query);
    // Onbellek davranisi live ile ayni tutuluyor: ekran iki modda ayni sekilde
    // davransin, onbellek hatasi yalnizca mock'ta ortaya cikmasin.
    const cached = await this.cache.get<NormalizedFuelStation[]>(cacheKey);
    if (cached) {
      return { ok: true, value: cached };
    }

    const retrievedAt = new Date().toISOString();
    const stations: NormalizedFuelStation[] = [];

    for (const template of MOCK_STATION_TEMPLATES) {
      const placed = this.placeStation(template, query);
      // Yaricap filtresi GERCEKTEN uygulaniyor: 5 km secen surucuye 18 km
      // uzaktaki istasyonu gostermek, demo veriyi ise yaramaz kilardi.
      if (placed.distanceKm > query.radiusKm) {
        continue;
      }

      stations.push({
        id: template.id,
        provider: this.name,
        name: template.name,
        brand: template.brand,
        address: {
          street: template.street,
          houseNumber: template.houseNumber,
          postalCode: template.postalCode,
          city: template.city,
        },
        latitude: placed.latitude,
        longitude: placed.longitude,
        distanceKm: placed.distanceKm,
        isOpen: template.isOpen,
        pricesUpdatedAt: null,
        retrievedAt,
        hgvAccess: 'unknown',
        acceptedFuelCards: null,
        offerings: this.toOfferings(template),
      });
    }

    stations.sort((left, right) => (left.distanceKm ?? 0) - (right.distanceKm ?? 0));

    this.logger.debug(
      `Mock fuel stations: ${stations.length} within ${query.radiusKm} km (no network call)`,
    );
    await this.cache.set(cacheKey, stations);
    return { ok: true, value: stations };
  }
}
