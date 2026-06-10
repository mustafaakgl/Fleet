'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DefectSeverityBadge, DefectStatusBadge } from '@/components/defects/DefectStatusBadge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { defectsApi, getApiErrorMessage } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import type { Defect, DefectSeverity, DefectStatus } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const STATUS_VALUES: DefectStatus[] = ['offen', 'in_reparatur', 'behoben', 'bestaetigt'];
const SEVERITY_VALUES: DefectSeverity[] = ['kritisch', 'mittel', 'gering'];

export default function DefectsPage() {
  const { t } = useTranslation();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await defectsApi.list({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
      });
      setDefects(rows);
    } catch (e) {
      setDefects([]);
      setError(getApiErrorMessage(e, t('defects.loadError', 'Mängel konnten nicht geladen werden.')));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          <h1 className={FLEET_PAGE_TITLE}>{t('defects.title', 'Mängelmanagement')}</h1>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={FLEET_FILTER_SELECT}
        >
          <option value="">{t('defects.allStatuses', 'Alle Status')}</option>
          {STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {t(`defects.status.${status}`, status)}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={FLEET_FILTER_SELECT}
        >
          <option value="">{t('defects.allSeverities', 'Alle Schweregrade')}</option>
          {SEVERITY_VALUES.map((severity) => (
            <option key={severity} value={severity}>
              {t(`defects.severity.${severity}`, severity)}
            </option>
          ))}
        </select>
      </div>

      {!loading && error ? (
        <EmptyState
          icon={WifiOff}
          title={t('defects.loadErrorTitle', 'Daten konnten nicht geladen werden')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => {
            void load();
          }}
        />
      ) : null}

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('defects.loading', 'Laden…')}</div>
        ) : !error && defects.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={t('defects.emptyTitle', 'Keine Mängel')}
            subtitle={t('defects.emptyMessage', 'Offene Mängel erscheinen hier.')}
          />
        ) : !error ? (
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('defects.colDate', 'Datum')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('defects.colVehicle', 'Fahrzeug')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('defects.colTitle', 'Mangel')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('defects.colSeverity', 'Schwere')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('defects.colStatus', 'Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {defects.map((defect) => (
                <TableRow key={defect.id} className={FLEET_TABLE_ROW_CLICKABLE}>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/defects/${defect.id}`} className="block">
                      {formatDate(defect.created_at)}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                    <Link href={`/defects/${defect.id}`} className="block">
                      {defect.vehicle.plate_number}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Link href={`/defects/${defect.id}`} className="block">
                      {defect.title}
                    </Link>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <DefectSeverityBadge
                      severity={defect.severity}
                      label={t(`defects.severity.${defect.severity}`)}
                    />
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <DefectStatusBadge status={defect.status} label={t(`defects.status.${defect.status}`)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}
