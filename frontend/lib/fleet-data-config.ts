/** When true, FleetDataProvider seeds mock data and keeps it on API errors. */
export const USE_MOCK_FLEET_DATA =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
