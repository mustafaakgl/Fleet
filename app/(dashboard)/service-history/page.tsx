'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { serviceRecordsApi } from '@/lib/api';
import type { ServiceRecord } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ServiceHistoryPage() {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [repairCompanies, setRepairCompanies] = useState<string[]>([]);
  const [repairCompany, setRepairCompany] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, companies] = await Promise.all([
        serviceRecordsApi.list(repairCompany ? { repair_company: repairCompany } : undefined),
        serviceRecordsApi.getRepairCompanies(),
      ]);
      setRecords(rows);
      setRepairCompanies(companies);
    } catch (e) {
      setRecords([]);
      setError(e instanceof Error ? e.message : 'Failed to load service history');
    } finally {
      setLoading(false);
    }
  }, [repairCompany]);

  useEffect(() => {
    reload();
  }, [reload]);

  const totalCost = useMemo(
    () => records.reduce((sum, row) => sum + (Number(row.cost_amount) || 0), 0),
    [records],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Service History</h1>
        {!loading && !error && (
          <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
            {records.length}
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={repairCompany}
              onChange={(e) => setRepairCompany(e.target.value)}
              className="w-full sm:w-72"
            >
              <option value="">All repair companies</option>
              {repairCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <div className="text-sm text-gray-600">
              Total cost: <span className="font-semibold">{currency(totalCost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              icon={Wrench}
              title="Failed to load service history"
              subtitle={error}
              actionLabel="Retry"
              onAction={reload}
            />
          </div>
        ) : records.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wrench}
              title="No service records"
              subtitle="No maintenance records match current filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Service Task</TableHead>
                  <TableHead>Repair Company</TableHead>
                  <TableHead>Mileage (km)</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell className="font-semibold text-gray-900">{row.vehicle_plate}</TableCell>
                    <TableCell>{row.service_type}</TableCell>
                    <TableCell>{row.repair_company}</TableCell>
                    <TableCell>{row.mileage_km !== null && row.mileage_km !== undefined ? row.mileage_km.toLocaleString('de-DE') : '-'}</TableCell>
                    <TableCell>{currency(Number(row.cost_amount))}</TableCell>
                    <TableCell className="text-xs text-gray-600">{row.notes ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
