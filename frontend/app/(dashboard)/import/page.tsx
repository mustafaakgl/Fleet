'use client';

import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { importApi, type ImportResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function ResultPanel({ result, t }: { result: ImportResult; t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
      <p>{t('import.result.created', { count: result.created })}</p>
      <p>{t('import.result.skipped', { count: result.skipped })}</p>
      {result.errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-rose-700">
          {result.errors.slice(0, 10).map((err) => (
            <li key={`${err.row}-${err.message}`}>
              {t('import.result.errorRow', { row: err.row, message: err.message })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportCard({
  title,
  hint,
  sampleHref,
  sampleLabel,
  uploadLabel,
  onImport,
  loading,
  result,
  file,
  onFileChange,
  t,
}: {
  title: string;
  hint: string;
  sampleHref: string;
  sampleLabel: string;
  uploadLabel: string;
  onImport: () => void;
  loading: boolean;
  result: ImportResult | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={sampleHref}
          download
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
        >
          <Download className="h-4 w-4" />
          {sampleLabel}
        </a>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <Button type="button" className="mt-3" disabled={!file || loading} onClick={onImport}>
          <Upload className="mr-2 h-4 w-4" />
          {loading ? t('import.uploading') : uploadLabel}
        </Button>
        {result && <ResultPanel result={result} t={t} />}
      </CardContent>
    </Card>
  );
}

export default function ImportPage() {
  const { t } = useTranslation();
  const [driverFile, setDriverFile] = useState<File | null>(null);
  const [vehicleFile, setVehicleFile] = useState<File | null>(null);
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [userFile, setUserFile] = useState<File | null>(null);
  const [driverResult, setDriverResult] = useState<ImportResult | null>(null);
  const [vehicleResult, setVehicleResult] = useState<ImportResult | null>(null);
  const [companyResult, setCompanyResult] = useState<ImportResult | null>(null);
  const [userResult, setUserResult] = useState<ImportResult | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport(
    label: 'drivers' | 'vehicles' | 'companies' | 'users',
    file: File | null,
    setLoading: (value: boolean) => void,
    setResult: (value: ImportResult) => void,
  ) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result =
        label === 'drivers'
          ? await importApi.drivers(file)
          : label === 'vehicles'
            ? await importApi.vehicles(file)
            : label === 'companies'
              ? await importApi.companies(file)
              : await importApi.users(file);
      setResult(result);
    } catch {
      setError(t(`import.errors.${label}`));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('import.title')}</h1>
        <p className="text-sm text-slate-600">{t('import.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div id="drivers">
      <ImportCard
        title={t('import.driversTitle')}
        hint={t('import.driversHint')}
        sampleHref="/samples/drivers.csv"
        sampleLabel={t('import.downloadSampleDrivers')}
        uploadLabel={t('import.uploadDrivers')}
        onImport={() => void runImport('drivers', driverFile, setDriverLoading, setDriverResult)}
        loading={driverLoading}
        result={driverResult}
        file={driverFile}
        onFileChange={setDriverFile}
        t={t}
      />
      </div>

      <div id="vehicles">
      <ImportCard
        title={t('import.vehiclesTitle')}
        hint={t('import.vehiclesHint')}
        sampleHref="/samples/vehicles.csv"
        sampleLabel={t('import.downloadSampleVehicles')}
        uploadLabel={t('import.uploadVehicles')}
        onImport={() => void runImport('vehicles', vehicleFile, setVehicleLoading, setVehicleResult)}
        loading={vehicleLoading}
        result={vehicleResult}
        file={vehicleFile}
        onFileChange={setVehicleFile}
        t={t}
      />
      </div>

      <div id="companies">
      <ImportCard
        title={t('import.companiesTitle')}
        hint={t('import.companiesHint')}
        sampleHref="/samples/companies.csv"
        sampleLabel={t('import.downloadSampleCompanies')}
        uploadLabel={t('import.uploadCompanies')}
        onImport={() => void runImport('companies', companyFile, setCompanyLoading, setCompanyResult)}
        loading={companyLoading}
        result={companyResult}
        file={companyFile}
        onFileChange={setCompanyFile}
        t={t}
      />
      </div>

      <div id="users">
      <ImportCard
        title={t('import.usersTitle')}
        hint={t('import.usersHint')}
        sampleHref="/samples/users.csv"
        sampleLabel={t('import.downloadSampleUsers')}
        uploadLabel={t('import.uploadUsers')}
        onImport={() => void runImport('users', userFile, setUserLoading, setUserResult)}
        loading={userLoading}
        result={userResult}
        file={userFile}
        onFileChange={setUserFile}
        t={t}
      />
      </div>
    </div>
  );
}
