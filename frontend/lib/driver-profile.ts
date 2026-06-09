import type { Driver, DriverPortalMe } from '@/lib/types';

export function isDriverHomeAddressComplete(
  driver: Pick<
    Driver | DriverPortalMe['driver'],
    'home_address_street' | 'home_address_zip_code' | 'home_address_city' | 'home_address_country' | 'homeAddressStreet' | 'homeAddressZipCode' | 'homeAddressCity' | 'homeAddressCountry'
  >,
): boolean {
  const street = ('home_address_street' in driver ? driver.home_address_street : driver.homeAddressStreet)?.trim();
  const zip = ('home_address_zip_code' in driver ? driver.home_address_zip_code : driver.homeAddressZipCode)?.trim();
  const city = ('home_address_city' in driver ? driver.home_address_city : driver.homeAddressCity)?.trim();
  const country = ('home_address_country' in driver ? driver.home_address_country : driver.homeAddressCountry)?.trim();
  return Boolean(street && zip && city && country);
}

export function formatDriverHomeAddress(
  driver: Pick<
    Driver | DriverPortalMe['driver'],
    'home_address_street' | 'home_address_zip_code' | 'home_address_city' | 'home_address_country' | 'homeAddressStreet' | 'homeAddressZipCode' | 'homeAddressCity' | 'homeAddressCountry'
  >,
): string {
  const street = ('home_address_street' in driver ? driver.home_address_street : driver.homeAddressStreet)?.trim();
  const zip = ('home_address_zip_code' in driver ? driver.home_address_zip_code : driver.homeAddressZipCode)?.trim();
  const city = ('home_address_city' in driver ? driver.home_address_city : driver.homeAddressCity)?.trim();
  const country = ('home_address_country' in driver ? driver.home_address_country : driver.homeAddressCountry)?.trim();
  const locality = [zip, city].filter(Boolean).join(' ');
  return [street, locality, country].filter(Boolean).join(', ') || '—';
}
