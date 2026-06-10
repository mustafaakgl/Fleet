'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driverLicensesApi } from '@/lib/api';

const LICENSE_CLASSES = [
  'B',
  'BE',
  'C1',
  'C1E',
  'C',
  'CE',
  'D1',
  'D1E',
  'D',
  'DE',
  'AM',
  'A1',
  'A2',
  'A',
] as const;

type DriverLicenseFormProps = {
  driverId: string;
  onCreated?: () => void;
};

export function DriverLicenseForm({ driverId, onCreated }: DriverLicenseFormProps) {
  const { t } = useTranslation();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [classes, setClasses] = useState<string[]>(['B']);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleClass(value: string) {
    setClasses((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!licenseNumber.trim() || !issuingAuthority.trim() || !issuedAt || !expiresAt) {
      setError(t('driverLicense.formRequired'));
      return;
    }
    if (classes.length === 0) {
      setError(t('driverLicense.classesRequired'));
      return;
    }

    const formData = new FormData();
    formData.append('driver_id', driverId);
    formData.append('license_number', licenseNumber.trim());
    formData.append('issuing_authority', issuingAuthority.trim());
    formData.append('issued_at', issuedAt);
    formData.append('expires_at', expiresAt);
    classes.forEach((cls) => formData.append('classes', cls));
    if (frontFile) formData.append('front', frontFile);
    if (backFile) formData.append('back', backFile);

    setSaving(true);
    try {
      await driverLicensesApi.create(formData);
      setLicenseNumber('');
      setIssuingAuthority('');
      setIssuedAt('');
      setExpiresAt('');
      setClasses(['B']);
      setFrontFile(null);
      setBackFile(null);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('driverLicense.createError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="license-number">{t('driverLicense.number')}</Label>
          <Input
            id="license-number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder={t('licenseCompliance.form.licensePlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issuing-authority">{t('driverLicense.authority')}</Label>
          <Input
            id="issuing-authority"
            value={issuingAuthority}
            onChange={(e) => setIssuingAuthority(e.target.value)}
            placeholder={t('licenseCompliance.form.authorityPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issued-at">{t('driverLicense.issuedAt')}</Label>
          <Input id="issued-at" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expires-at">{t('driverLicense.expiresAt')}</Label>
          <Input id="expires-at" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('driverLicense.classes')}</Label>
        <div className="flex flex-wrap gap-2">
          {LICENSE_CLASSES.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => toggleClass(cls)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                classes.includes(cls)
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-600'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="front-photo">{t('driverLicense.frontPhoto')}</Label>
          <Input
            id="front-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFrontFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="back-photo">{t('driverLicense.backPhoto')}</Label>
          <Input
            id="back-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" disabled={saving}>
        {saving ? t('driverLicense.saving') : t('driverLicense.save')}
      </Button>
    </form>
  );
}
