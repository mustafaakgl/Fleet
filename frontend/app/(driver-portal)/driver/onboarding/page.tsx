'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driverPortalApi } from '@/lib/api';
import type { DriverPortalMe } from '@/lib/types';

export default function DriverOnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [profile, setProfile] = useState<DriverPortalMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');
  const [street, setStreet] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Deutschland');

  useEffect(() => {
    driverPortalApi
      .me()
      .then((data) => {
        setProfile(data);
        setPhone(data.driver.phone ?? '');
        setLicenseNumber(data.driver.licenseNumber ?? '');
        setLicenseExpiryDate(data.driver.licenseExpiryDate ?? '');
        setStreet(data.driver.homeAddressStreet ?? '');
        setZipCode(data.driver.homeAddressZipCode ?? '');
        setCity(data.driver.homeAddressCity ?? '');
        setCountry(data.driver.homeAddressCountry ?? 'Deutschland');
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!street.trim() || !zipCode.trim() || !city.trim() || !country.trim()) {
      setError(t('driverPortal.onboarding.validationRequired'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.updateProfile({
        phone: phone.trim() || undefined,
        license_number: licenseNumber.trim() || undefined,
        license_expiry_date: licenseExpiryDate || undefined,
        home_address_street: street.trim(),
        home_address_zip_code: zipCode.trim(),
        home_address_city: city.trim(),
        home_address_country: country.trim(),
      });
      router.replace('/driver');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.onboarding.submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <DriverPageBack href="/driver" label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.onboarding.title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.onboarding.subtitle')}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('driverPortal.assignments.loading')}
            </div>
          ) : profile ? (
            <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">{t('driverPortal.onboarding.contactSection')}</h2>
                <div className="space-y-2">
                  <Label>{t('driverPortal.profile.phone')}</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 123 456 789" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('driverPortal.onboarding.licenseNumber')}</Label>
                    <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.onboarding.licenseExpiry')}</Label>
                    <Input type="date" value={licenseExpiryDate} onChange={(e) => setLicenseExpiryDate(e.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">{t('driverPortal.onboarding.addressSection')}</h2>
                <div className="space-y-2">
                  <Label>{t('driverPortal.onboarding.street')} *</Label>
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Musterstraße 12" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('driverPortal.onboarding.zipCode')} *</Label>
                    <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="12345" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('driverPortal.onboarding.city')} *</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Berlin" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('driverPortal.onboarding.country')} *</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Deutschland" />
                </div>
              </section>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full bg-[#1a4d7a] hover:bg-[#163a5c]" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('driverPortal.onboarding.submit')}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-red-600">{t('driverPortal.profile.loadError')}</p>
          )}
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
