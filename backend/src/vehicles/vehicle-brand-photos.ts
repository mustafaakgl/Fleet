/** Demo/stock photos keyed by vehicle brand (Wikimedia Commons). Use 500px thumbs — 400px paths often 404. */
export const VEHICLE_BRAND_PHOTOS: Record<string, string> = {
  'Mercedes-Benz':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Mercedes-Benz_Actros_2551.jpg/500px-Mercedes-Benz_Actros_2551.jpg',
  MAN: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/MAN_TGX.jpg',
  Scania:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Scania_R450.jpg/500px-Scania_R450.jpg',
  Volvo: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Volvo_FH_truck.jpg',
  DAF: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/DAF_XF.jpg/500px-DAF_XF.jpg',
  Iveco:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Iveco_Stralis.jpg/500px-Iveco_Stralis.jpg',
  Renault:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Renault_Trucks_T.jpg/500px-Renault_Trucks_T.jpg',
  Ford:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Ford_Transit_Custom.jpg/500px-Ford_Transit_Custom.jpg',
};

export function photoUrlForVehicleBrand(brand: string, explicit?: string | null): string | undefined {
  if (explicit) return explicit;
  return VEHICLE_BRAND_PHOTOS[brand];
}
