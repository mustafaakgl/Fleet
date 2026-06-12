/**
 * When true, FleetDataProvider seeds mock data and keeps it on API errors.
 * Hard-disabled in production builds — mock data is a development-only tool.
 */
export const USE_MOCK_FLEET_DATA =
  process.env.NODE_ENV !== 'production' &&
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
