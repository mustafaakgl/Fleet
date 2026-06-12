'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/i18n.client';
import { authApi } from '@/lib/api';
import { getToken, saveAuth, updateLocalUser } from '@/lib/auth';
import {
  defaultUsernameFromEmail,
  loadLoginPasswordPreferences,
  saveLoginPasswordPreferences,
  type LoginPasswordPreferences,
} from '@/lib/login-password-preferences';
import { isPasswordStrong } from '@/lib/password-policy';
import { SecuritySettingsPanel } from '@/components/security/SecuritySettingsPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type TabId = 'login' | 'password';

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

function FormRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-start md:gap-6">
      <div className="md:pt-2 md:text-right">
        <Label className="text-sm font-medium text-slate-800">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </Label>
      </div>
      <div>
        {children}
        {hint ? <FieldHint>{hint}</FieldHint> : null}
      </div>
    </div>
  );
}

export function LoginPasswordPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>('login');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('de');
  const [prefs, setPrefs] = useState<LoginPasswordPreferences>({});

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    Promise.all([authApi.me(), authApi.oidcConfig().catch(() => ({ enabled: false, label: '' }))])
      .then(([user, oidc]) => {
        const stored = loadLoginPasswordPreferences(user.id);
        setUserId(user.id);
        setEmail(user.email);
        setLanguage(user.language?.startsWith('en') ? 'en' : user.language?.startsWith('tr') ? 'tr' : 'de');
        setUsername(stored.username ?? defaultUsernameFromEmail(user.email));
        setPrefs(stored);
        setSsoEnabled(oidc.enabled);
      })
      .catch(() => setError(t('settings.loginPassword.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  function updatePref<K extends keyof LoginPasswordPreferences>(
    key: K,
    value: LoginPasswordPreferences[K],
  ) {
    setPrefs((current) => ({ ...current, [key]: value }));
  }

  async function saveLoginInformation() {
    if (!userId || !username.trim() || !email.trim()) {
      setError(t('settings.loginPassword.validation.required'));
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await authApi.updateLoginProfile({
        email: email.trim(),
        language,
      });

      saveLoginPasswordPreferences(userId, {
        ...prefs,
        username: username.trim(),
      });

      const token = getToken();
      if (token) {
        saveAuth(token, {
          id: updated.id,
          email: updated.email,
          name: updated.name ?? updated.email,
          role: updated.role,
          language: updated.language,
          fleet_ops: updated.fleet_ops,
          companyIds: updated.companyIds,
          companyId: updated.companyId,
          companies: updated.companies,
        });
      } else {
        updateLocalUser({ email: updated.email, language: updated.language });
      }

      void i18n.changeLanguage(language);
      setNotice(t('settings.loginPassword.saveSuccess'));
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || t('settings.loginPassword.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function savePasswordChange() {
    setError(null);
    setNotice(null);

    if (!currentPassword.trim()) {
      setError(t('settings.loginPassword.validation.currentPassword'));
      return;
    }
    if (!isPasswordStrong(newPassword)) {
      setError(t('usersAdmin.passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('settings.loginPassword.validation.passwordMismatch'));
      return;
    }

    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice(t('settings.loginPassword.passwordChanged'));
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const text = Array.isArray(message) ? message.join(' ') : message;
      setError(text || t('settings.loginPassword.passwordChangeError'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('accountMenu.loginPassword')}</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['login', 'password'] as TabId[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTab(item);
              setError(null);
              setNotice(null);
            }}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
              tab === item
                ? 'bg-emerald-700 text-white'
                : 'text-emerald-700 hover:bg-emerald-50',
            )}
          >
            {t(`settings.loginPassword.tabs.${item}`)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {tab === 'login' ? (
        <>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <FormRow label={t('settings.loginPassword.username')} required hint={t('settings.loginPassword.usernameHint')}>
                <Input value={username} onChange={(event) => setUsername(event.target.value)} />
              </FormRow>

              <FormRow label={t('settings.contacts.fields.email')} required>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </FormRow>

              <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                <div />
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(prefs.marketingOptIn)}
                    onChange={(event) => updatePref('marketingOptIn', event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span className="text-sm text-slate-800">
                    {t('settings.loginPassword.marketingOptIn')}
                  </span>
                </label>
              </div>

              <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-center md:gap-6">
                <div className="md:text-right">
                  <span className="text-sm font-medium text-slate-800">
                    {t('settings.loginPassword.google')}
                  </span>
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                    disabled={!ssoEnabled}
                    onClick={() => {
                      window.location.href = authApi.oidcLoginUrl();
                    }}
                  >
                    {t('settings.loginPassword.connectGoogle')}
                  </Button>
                  <FieldHint>{t('settings.loginPassword.googleHint')}</FieldHint>
                </div>
              </div>

              <FormRow label={t('settings.general.timeZone')} hint={t('settings.loginPassword.timeZoneHint')}>
                <Select
                  value={prefs.timeZone ?? 'Europe/Berlin'}
                  onChange={(event) => updatePref('timeZone', event.target.value)}
                >
                  <option value="Europe/Berlin">{t('settings.timeZones.berlin')}</option>
                  <option value="Europe/Istanbul">{t('settings.timeZones.istanbul')}</option>
                  <option value="Europe/London">{t('settings.timeZones.london')}</option>
                  <option value="America/New_York">{t('settings.timeZones.newYork')}</option>
                </Select>
              </FormRow>

              <FormRow label={t('usersAdmin.fieldLanguage')}>
                <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="en">{t('usersAdmin.languages.en')}</option>
                  <option value="de">{t('usersAdmin.languages.de')}</option>
                  <option value="tr">{t('usersAdmin.languages.tr')}</option>
                </Select>
              </FormRow>
            </CardContent>
          </Card>

          <div className="flex justify-end border-t border-slate-200 pt-6">
            <Button
              type="button"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void saveLoginInformation()}
            >
              {saving ? t('settings.saving') : t('settings.profile.save')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <FormRow
                label={t('settings.loginPassword.currentPassword')}
                required
                hint={t('settings.loginPassword.currentPasswordHint')}
              >
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </FormRow>

              <FormRow label={t('settings.loginPassword.newPassword')} required>
                <div className="space-y-2">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                  <FieldHint>{t('settings.loginPassword.newPasswordHint1')}</FieldHint>
                  <FieldHint>{t('settings.loginPassword.newPasswordHint2')}</FieldHint>
                </div>
              </FormRow>

              <FormRow label={t('settings.loginPassword.confirmPassword')} required>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </FormRow>
            </CardContent>
          </Card>

          <div className="flex justify-end border-t border-slate-200 pt-6">
            <Button
              type="button"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void savePasswordChange()}
            >
              {saving ? t('settings.saving') : t('settings.loginPassword.changePassword')}
            </Button>
          </div>
        </>
      )}

      <div className="space-y-4 border-t border-slate-200 pt-8">
        <h2 className="text-lg font-semibold text-slate-900">{t('security.mfaTitle')}</h2>
        <SecuritySettingsPanel />
      </div>
    </div>
  );
}
