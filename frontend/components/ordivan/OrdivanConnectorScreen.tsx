'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, Plug, RefreshCw, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ordivanApi } from '@/lib/api';
import {
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
} from '@/lib/fleet-table';
import {
  connectorStateKey,
  connectorTone,
  needsUpdate,
  protocolLabelKey,
  protocolTone,
  type Tone,
} from '@/lib/ordivan-view';
import type { OrdivanConnectorList } from '@/lib/types';

const TONE_BADGE: Record<Tone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  positive: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline',
};

/** Faz 12'de connector'a verilebilecek yetenekler — registry ile ayni liste. */
const CAPABILITIES = ['system.echo', 'document.classification'] as const;

/**
 * Connector yonetimi (Faz 12).
 *
 * TEK SEFERLIK SIRLAR: enrollment kodu ve anahtar YALNIZCA uretildikleri
 * yanitla bir kez gelir ve ekranda acikca "bir daha gosterilmeyecek" diye
 * isaretlenir. Liste ucu ne anahtari ne ozetini tasiyor, dolayisiyla sayfa
 * yenilendiginde bu degerler kaybolur — istenen davranis budur.
 *
 * ROL: admin/boss. Sunucu ayrica koruyor; bu bilesenin gizlenmesi guvenlik
 * degil arayuz nezaketidir.
 */
export function OrdivanConnectorScreen() {
  const { t, i18n } = useTranslation();

  const [data, setData] = useState<OrdivanConnectorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>(['system.echo']);
  const [busy, setBusy] = useState(false);
  /** Bir kez gosterilen sir. Sayfa yenilenince KAYBOLUR. */
  const [secret, setSecret] = useState<{ kind: 'enrollment' | 'credential'; value: string } | null>(
    null,
  );

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorKey(null);
    try {
      setData(await ordivanApi.listConnectors(controller.signal));
    } catch {
      if (!controller.signal.aborted) setErrorKey('automation.connector.loadFailed');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const createEnrollment = async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      const created = await ordivanApi.createEnrollment({
        displayName: displayName.trim(),
        capabilities,
      });
      setSecret({ kind: 'enrollment', value: created.enrollmentCode });
      setDisplayName('');
      await load();
    } catch {
      setErrorKey('automation.connector.enrollmentFailed');
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (id: string) => {
    setBusy(true);
    try {
      const rotated = await ordivanApi.rotateCredential(id);
      setSecret({ kind: 'credential', value: rotated.credential });
      await load();
    } catch {
      setErrorKey('automation.connector.rotateFailed');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await ordivanApi.revokeConnector(id);
      await load();
    } catch {
      setErrorKey('automation.connector.revokeFailed');
    } finally {
      setBusy(false);
    }
  };

  const connectors = data?.connectors ?? [];

  return (
    <div className="space-y-4" data-testid="ordivan-connector-screen">
      {/* Calisma modu — `disabled` iken Fleet calisir, uclar kapalidir. */}
      {data ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm" data-testid="ordivan-mode">
          {t(`automation.connector.mode.${data.mode}`)}
          <span className="ml-2 text-muted-foreground">
            {t('automation.connector.protocolLine', {
              current: data.protocol.current,
              minimum: data.protocol.minimumSupported,
            })}
          </span>
        </p>
      ) : null}

      {errorKey ? <p className="text-sm text-red-600">{t(errorKey)}</p> : null}

      {/* Yeni connector: tek kullanimlik kod uretir. */}
      <div className="space-y-2 rounded-md border p-3">
        <h3 className="text-sm font-semibold">{t('automation.connector.newTitle')}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs" htmlFor="connector-name">
            {t('automation.connector.displayName')}
            <Input
              id="connector-name"
              className="mt-1 w-56"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('automation.connector.displayNamePlaceholder')}
            />
          </label>
          <fieldset className="text-xs">
            <legend className="mb-1">{t('automation.connector.capabilities')}</legend>
            <div className="flex gap-3">
              {CAPABILITIES.map((capability) => (
                <label key={capability} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={capabilities.includes(capability)}
                    onChange={(event) =>
                      setCapabilities((current) =>
                        event.target.checked
                          ? [...new Set([...current, capability])]
                          : current.filter((item) => item !== capability),
                      )
                    }
                  />
                  {capability}
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            size="sm"
            disabled={busy || displayName.trim().length === 0 || capabilities.length === 0}
            onClick={createEnrollment}
            data-testid="ordivan-create-enrollment"
          >
            <Plug className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('automation.connector.createEnrollment')}
          </Button>
        </div>
      </div>

      {/* TEK SEFERLIK SIR — bir daha gosterilmez. */}
      {secret ? (
        <div
          className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3"
          data-testid="ordivan-secret"
        >
          <p className="text-sm font-medium text-amber-900">
            {t(
              secret.kind === 'enrollment'
                ? 'automation.connector.enrollmentCreated'
                : 'automation.connector.credentialCreated',
            )}
          </p>
          <code className="block break-all rounded bg-white p-2 text-xs">{secret.value}</code>
          <p className="text-xs text-amber-900">{t('automation.connector.secretOnce')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(secret.value);
              setSecret(null);
            }}
            data-testid="ordivan-secret-dismiss"
          >
            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('automation.connector.copyAndClose')}
          </Button>
        </div>
      ) : null}

      {!loading && connectors.length === 0 ? (
        <EmptyState
          icon={Plug}
          title={t('automation.connector.emptyTitle')}
          subtitle={t('automation.connector.emptyBody')}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.connector.name')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.connector.state')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.connector.lastHeartbeat')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.connector.versions')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.connector.capabilities')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.connector.credential')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD} />
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {connectors.map((connector) => (
                <TableRow key={connector.id} data-testid="ordivan-connector-row">
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{connector.displayName}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {/* Renk TEK BASINA anlam tasimiyor: rozetin metni de var. */}
                    <Badge variant={TONE_BADGE[connectorTone(connector)]}>
                      {t(connectorStateKey(connector))}
                    </Badge>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {connector.lastHeartbeatAt
                      ? new Date(connector.lastHeartbeatAt).toLocaleString(i18n.language)
                      : '—'}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <div className="flex flex-col gap-1">
                      <span>{connector.connectorVersion ?? '—'}</span>
                      <Badge variant={TONE_BADGE[protocolTone(connector.protocolCompatibility)]}>
                        {t(protocolLabelKey(connector.protocolCompatibility))}
                      </Badge>
                      {needsUpdate(connector) ? (
                        <span
                          className="flex items-center gap-1 text-xs text-red-700"
                          data-testid={`ordivan-update-${connector.id}`}
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {t('automation.connector.updateAvailable')}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {connector.capabilities.join(', ') || '—'}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {/* Yalnizca onek: anahtar ve ozeti sunucudan HIC gelmiyor. */}
                    {connector.credentialPrefix ? `${connector.credentialPrefix}…` : '—'}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || connector.status === 'revoked'}
                        onClick={() => rotate(connector.id)}
                        data-testid={`ordivan-rotate-${connector.id}`}
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        {t('automation.connector.rotate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || connector.status === 'revoked'}
                        onClick={() => revoke(connector.id)}
                        data-testid={`ordivan-revoke-${connector.id}`}
                      >
                        <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        {t('automation.connector.revoke')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
