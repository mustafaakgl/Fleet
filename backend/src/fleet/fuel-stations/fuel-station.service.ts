import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FuelProductType } from '@prisma/client';
import { DriverVehicleService } from '../driver-vehicle.service';
import {
  compatibleProductsForStationFilter,
  filterStationsForVehicle,
} from './core/fuel-compatibility.util';
import {
  FUEL_STATION_PROVIDER,
  type FuelStationAttribution,
  type FuelStationDataMode,
  type FuelStationProvider,
  type NormalizedFuelStation,
} from './fuel-station.types';
import { VehicleFuelCompatibilityService } from './vehicle-fuel-compatibility.service';

export interface NearbyFuelStationsResponse {
  vehicle: {
    id: string;
    plateNumber: string;
    compatibleProducts: FuelProductType[];
  };
  search: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  /**
   * Verinin gercek mi demo mu oldugu. Istemci demo uyarisini BU ALANA gore
   * gosterir; kendi ortam degiskenine bakarak karar vermez.
   */
  dataMode: FuelStationDataMode;
  /** Gosterilmesi gereken kaynak atfi (live'da CC BY 4.0 zorunlu). */
  attribution: FuelStationAttribution;
  /** Bu saglayicinin fiyat verebildigi urunler — arac onayindan BAGIMSIZ. */
  providerSupportedProducts: FuelProductType[];
  /**
   * Arac kabul ediyor ama saglayici fiyat vermiyor (ornegin HVO100).
   * Surucuye "sistem bunu bilmiyor" demenin yolu; sessizce yutulmuyor.
   */
  unsupportedCompatibleProducts: FuelProductType[];
  stations: NormalizedFuelStation[];
}

/**
 * Surucunun aracina UYAN istasyonlar.
 *
 * Akis, sirasi onemli:
 *   1) kullanici -> surucu profili
 *   2) surucu -> BUGUNKU ARAC (sunucu tarafinda; istekte vehicleId YOK)
 *   3) arac -> acikca onaylanmis urunler (yoksa 409, tahmin yok)
 *   4) saglayici -> istasyonlar
 *   5) filtre -> uyumsuz teklifler ve bos kalan istasyonlar duser
 *
 * 3. adim 4. adimdan ONCE: uyumluluk tanimsizsa disariya hic cikilmaz, bosuna
 * kota harcanmaz.
 */
@Injectable()
export class FuelStationService {
  private readonly logger = new Logger(FuelStationService.name);

  constructor(
    private readonly driverVehicle: DriverVehicleService,
    private readonly compatibility: VehicleFuelCompatibilityService,
    @Inject(FUEL_STATION_PROVIDER) private readonly provider: FuelStationProvider,
  ) {}

  async findNearbyForDriver(
    userId: string,
    query: { latitude: number; longitude: number; radiusKm: number },
  ): Promise<NearbyFuelStationsResponse> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);

    // Arac SUNUCUDA cozuluyor. Surucu istekle arac secemez: baska bir aracin
    // yakit profilini secebilmek, uyumluluk filtresini istemciden atlatmak
    // demek olurdu.
    const vehicle = await this.driverVehicle.resolveTodayVehicle(driver.id);
    if (!vehicle) {
      throw new ConflictException({ code: 'driver_vehicle_not_resolved' });
    }

    const rows = await this.compatibility.listRowsForVehicle(vehicle.id);
    if (rows.length === 0) {
      // Uyumluluk hic tanimli degil. Tahmin YOK — "kamyon herhalde dizeldir"
      // demek yanlis yakit hasarina davetiye. Ofis bu araci tanimlayana kadar
      // uc kontrollu sekilde duruyor.
      throw new ConflictException({ code: 'vehicle_fuel_compatibility_missing' });
    }

    const compatibleProducts = compatibleProductsForStationFilter(rows);
    if (compatibleProducts.length === 0) {
      // Kayit var ama hicbiri approved PRIMARY/ALTERNATIVE degil (ornegin
      // yalnizca AdBlue tanimli). Filtrelenecek ana yakit olmadigi icin bu da
      // "tanimsiz" ile ayni sonuca varir.
      throw new ConflictException({ code: 'vehicle_fuel_compatibility_missing' });
    }

    const providerSupported = [...this.provider.supportedProducts()];
    const unsupportedCompatibleProducts = compatibleProducts.filter(
      (product) => !providerSupported.includes(product),
    );

    const vehicleView = {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      compatibleProducts,
    };
    const searchView = {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
    };

    const result = await this.provider.search(query);
    if (!result.ok) {
      // Harici saglayicinin gecici arizasi backend'i cokertmiyor: 503 +
      // makine-okunur kod. Mesaj saglayici anahtarini ICERMEZ.
      this.logger.warn(`Fuel station search failed (${result.error}): ${result.message}`);
      throw new ServiceUnavailableException({
        code:
          result.error === 'provider_not_configured'
            ? 'fuel_station_provider_not_configured'
            : 'fuel_station_provider_unavailable',
        provider: this.provider.name,
      });
    }

    const stations = filterStationsForVehicle(result.value, compatibleProducts);

    return {
      vehicle: vehicleView,
      search: searchView,
      dataMode: this.provider.dataMode,
      attribution: this.provider.attribution,
      providerSupportedProducts: providerSupported,
      unsupportedCompatibleProducts,
      // Hic istasyon bulunamamasi hata DEGIL: kirsalda 5 km yaricapta gercekten
      // istasyon olmayabilir ya da hepsi filtreden dusmus olabilir.
      stations,
    };
  }
}
