'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SecuritySettingsPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const status = await authApi.mfaStatus();
      setMfaEnabled(status.mfa_enabled);
      setSetupPending(status.mfa_setup_pending);
    } catch {
      setError(t('security.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [t]);

  async function handleBeginSetup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const setup = await authApi.mfaSetup();
      setSetupSecret(setup.secret);
      setOtpauthUrl(setup.otpauth_url);
      setSetupPending(true);
      setMessage(t('security.setupStarted'));
    } catch {
      setError(t('security.setupError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSetup() {
    if (confirmCode.length !== 6) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await authApi.mfaConfirm(confirmCode);
      setMfaEnabled(true);
      setSetupPending(false);
      setSetupSecret(null);
      setOtpauthUrl(null);
      setConfirmCode('');
      setMessage(t('security.enabled'));
    } catch {
      setError(t('security.confirmError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!disablePassword || disableCode.length !== 6) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await authApi.mfaDisable(disablePassword, disableCode);
      setMfaEnabled(false);
      setDisablePassword('');
      setDisableCode('');
      setMessage(t('security.disabled'));
    } catch {
      setError(t('security.disableError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          {t('security.mfaTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              {mfaEnabled ? t('security.mfaEnabled') : t('security.mfaDisabled')}
            </p>

            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            {!mfaEnabled ? (
              <div className="space-y-4">
                {!setupSecret ? (
                  <Button type="button" onClick={() => void handleBeginSetup()} disabled={busy}>
                    {busy ? t('security.settingUp') : t('security.enableMfa')}
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">{t('security.scanQr')}</p>
                    {otpauthUrl ? (
                      <a
                        href={otpauthUrl}
                        className="break-all text-sm font-medium text-blue-700 hover:underline"
                      >
                        {t('security.openAuthenticator')}
                      </a>
                    ) : null}
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {t('security.manualSecret')}
                      </p>
                      <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-sm">
                        {setupSecret}
                      </code>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mfa-confirm">{t('security.verificationCode')}</Label>
                      <Input
                        id="mfa-confirm"
                        inputMode="numeric"
                        maxLength={6}
                        value={confirmCode}
                        onChange={(event) =>
                          setConfirmCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="123456"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => void handleConfirmSetup()}
                      disabled={busy || confirmCode.length !== 6}
                    >
                      {busy ? t('security.confirming') : t('security.confirmSetup')}
                    </Button>
                  </div>
                )}
                {setupPending && !setupSecret ? (
                  <p className="text-xs text-amber-700">{t('security.pendingHint')}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-slate-200 p-4">
                <p className="text-sm text-slate-700">{t('security.disableHint')}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="disable-password">{t('security.currentPassword')}</Label>
                  <Input
                    id="disable-password"
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disable-code">{t('security.verificationCode')}</Label>
                  <Input
                    id="disable-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(event) =>
                      setDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  onClick={() => void handleDisable()}
                  disabled={busy || !disablePassword || disableCode.length !== 6}
                >
                  {busy ? t('security.disabling') : t('security.disableMfa')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
