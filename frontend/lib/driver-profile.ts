type DriverHomeAddressInput = {
  home_address_street?: string | null;
  home_address_zip_code?: string | null;
  home_address_city?: string | null;
  home_address_country?: string | null;
  homeAddressStreet?: string | null;
  homeAddressZipCode?: string | null;
  homeAddressCity?: string | null;
  homeAddressCountry?: string | null;
};

export function isDriverHomeAddressComplete(
  driver: DriverHomeAddressInput,
): boolean {
  const street = ('home_address_street' in driver ? driver.home_address_street : driver.homeAddressStreet)?.trim();
  const zip = ('home_address_zip_code' in driver ? driver.home_address_zip_code : driver.homeAddressZipCode)?.trim();
  const city = ('home_address_city' in driver ? driver.home_address_city : driver.homeAddressCity)?.trim();
  const country = ('home_address_country' in driver ? driver.home_address_country : driver.homeAddressCountry)?.trim();
  return Boolean(street && zip && city && country);
}

export function formatDriverHomeAddress(
  driver: DriverHomeAddressInput,
): string {
  const street = ('home_address_street' in driver ? driver.home_address_street : driver.homeAddressStreet)?.trim();
  const zip = ('home_address_zip_code' in driver ? driver.home_address_zip_code : driver.homeAddressZipCode)?.trim();
  const city = ('home_address_city' in driver ? driver.home_address_city : driver.homeAddressCity)?.trim();
  const country = ('home_address_country' in driver ? driver.home_address_country : driver.homeAddressCountry)?.trim();
  const locality = [zip, city].filter(Boolean).join(' ');
  return [street, locality, country].filter(Boolean).join(', ') || '—';
}
