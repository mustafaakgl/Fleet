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

export default function ImportPage() {
  const { t } = useTranslation();
  const [driverFile, setDriverFile] = useState<File | null>(null);
  const [vehicleFile, setVehicleFile] = useState<File | null>(null);
  const [driverResult, setDriverResult] = useState<ImportResult | null>(null);
  const [vehicleResult, setVehicleResult] = useState<ImportResult | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importDrivers() {
    if (!driverFile) return;
    setDriverLoading(true);
    setError(null);
    try {
      const result = await importApi.drivers(driverFile);
      setDriverResult(result);
    } catch {
      setError(t('import.errors.drivers'));
    } finally {
      setDriverLoading(false);
    }
  }

  async function importVehicles() {
    if (!vehicleFile) return;
    setVehicleLoading(true);
    setError(null);
    try {
      const result = await importApi.vehicles(vehicleFile);
      setVehicleResult(result);
    } catch {
      setError(t('import.errors.vehicles'));
    } finally {
      setVehicleLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('import.title')}</h1>
        <p className="text-sm text-slate-600">{t('import.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t('import.driversTitle')}</CardTitle>
          <CardDescription>{t('import.driversHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/samples/drivers.csv"
            download
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
          >
            <Download className="h-4 w-4" />
            {t('import.downloadSampleDrivers')}
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setDriverFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <Button
            type="button"
            className="mt-3"
            disabled={!driverFile || driverLoading}
            onClick={importDrivers}
          >
            <Upload className="mr-2 h-4 w-4" />
            {driverLoading ? t('import.uploading') : t('import.uploadDrivers')}
          </Button>
          {driverResult && <ResultPanel result={driverResult} t={t} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('import.vehiclesTitle')}</CardTitle>
          <CardDescription>{t('import.vehiclesHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/samples/vehicles.csv"
            download
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
          >
            <Download className="h-4 w-4" />
            {t('import.downloadSampleVehicles')}
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setVehicleFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <Button
            type="button"
            className="mt-3"
            disabled={!vehicleFile || vehicleLoading}
            onClick={importVehicles}
          >
            <Upload className="mr-2 h-4 w-4" />
            {vehicleLoading ? t('import.uploading') : t('import.uploadVehicles')}
          </Button>
          {vehicleResult && <ResultPanel result={vehicleResult} t={t} />}
        </CardContent>
      </Card>
    </div>
  );
}
