'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, FileText, Loader2, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverLocationSharingCard } from '@/components/driver-portal/DriverLocationSharingCard';
import { DriverWorkSessionCard } from '@/components/driver-portal/DriverWorkSessionCard';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { driverPortalApi } from '@/lib/api';
import { performLogout } from '@/lib/auth';
import { applyDriverPortalLanguage } from '@/lib/driver-portal-language';
import { DRIVER_MESSENGER_LANGUAGES } from '@/lib/driver-portal-utils';
import { formatDriverHomeAddress } from '@/lib/driver-profile';
import type { DriverPortalMe, MessengerLanguage } from '@/lib/types';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

export default function DriverProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<DriverPortalMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);

  useEffect(() => {
    driverPortalApi
      .me()
      .then(async (nextProfile) => {
        setProfile(nextProfile);
        await applyDriverPortalLanguage(nextProfile.user.language);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLanguageChange(language: MessengerLanguage) {
    setLanguageBusy(true);
    setLanguageError(null);
    try {
      const updated = await driverPortalApi.updateLanguage(language);
      setProfile(updated);
      await applyDriverPortalLanguage(updated.user.language);
    } catch {
      setLanguageError(t('driverPortal.profile.languageFailed'));
    } finally {
      setLanguageBusy(false);
    }
  }

  function handleLogout() {
    void driverPortalApi.endWorkSession('logout').catch(() => undefined);
    performLogout('/login');
  }

  const fullName = profile ? `${profile.driver.firstName} ${profile.driver.lastName}`.trim() : '';

  return (
    <DriverPortalShell>
      <div className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('driverPortal.assignments.loading')}
          </div>
        ) : profile ? (
          <>
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a4d7a] text-lg font-bold text-white">
                  {fullName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{fullName}</p>
                  <p className="text-sm text-slate-600">{profile.driver.email ?? profile.user.email}</p>
                </div>
              </CardContent>
            </Card>

            {!profile.driver.profileComplete ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-900">{t('driverPortal.profile.completeHint')}</p>
                  <Button asChild variant="outline" size="sm" className="shrink-0 border-amber-300">
                    <Link href="/driver/onboarding">{t('driverPortal.profile.completeAction')}</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('driverPortal.profile.account')}</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label={t('driverPortal.profile.phone')} value={profile.driver.phone ?? '—'} />
                <InfoRow
                  label={t('driverPortal.profile.employeeNumber')}
                  value={profile.driver.employeeNumber ?? '—'}
                />
                <InfoRow label={t('driverPortal.profile.riskLevel')} value={profile.driver.riskLevel ?? '—'} />
                <InfoRow
                  label={t('driverPortal.profile.homeAddress')}
                  value={formatDriverHomeAddress(profile.driver)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('driverPortal.profile.employeeInfo')}</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow
                  label={t('driverPortal.profile.license')}
                  value={
                    profile.driver.licenseNumber
                      ? `${profile.driver.licenseNumber}${profile.driver.licenseExpiryDate ? ` · ${profile.driver.licenseExpiryDate}` : ''}`
                      : '—'
                  }
                />
                <InfoRow
                  label={t('driverPortal.profile.passport')}
                  value={
                    profile.driver.passportNumber
                      ? `${profile.driver.passportNumber}${profile.driver.passportExpiryDate ? ` · ${profile.driver.passportExpiryDate}` : ''}`
                      : '—'
                  }
                />
                <InfoRow
                  label={t('driverPortal.profile.currentVehicle')}
                  value={
                    profile.driver.assignedVehicle
                      ? `${profile.driver.assignedVehicle.plateNumber} · ${profile.driver.assignedVehicle.brand} ${profile.driver.assignedVehicle.model}`
                      : '—'
                  }
                />
                <InfoRow
                  label={t('driverPortal.profile.todayCompany')}
                  value={profile.driver.todayAssignment?.company.name ?? '—'}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('driverPortal.profile.language')}</CardTitle>
                <p className="text-sm text-slate-600">{t('driverPortal.profile.languageHint')}</p>
              </CardHeader>
              <CardContent>
                <Select
                  value={profile.user.language ?? 'de'}
                  disabled={languageBusy}
                  onChange={(e) => void handleLanguageChange(e.target.value as MessengerLanguage)}
                >
                  {DRIVER_MESSENGER_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </Select>
                {languageError ? <p className="mt-2 text-sm text-red-600">{languageError}</p> : null}
              </CardContent>
            </Card>

            <DriverWorkSessionCard />

            <DriverLocationSharingCard />

            <div className="grid grid-cols-1 gap-2">
              <Link
                href="/driver/notifications"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[#1a4d7a]" />
                  {t('driverPortal.profile.notifications')}
                </span>
                <span>→</span>
              </Link>
              <Link
                href="/driver/documents"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#1a4d7a]" />
                  {t('driverPortal.profile.documents')}
                </span>
                <span>→</span>
              </Link>
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              {t('driverPortal.signOut')}
            </Button>
          </>
        ) : (
          <p className="text-sm text-red-600">{t('driverPortal.profile.loadError')}</p>
        )}
      </div>
    </DriverPortalShell>
  );
}
