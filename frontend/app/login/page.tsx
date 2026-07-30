'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AxiosError } from 'axios';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { TRIAL_CTA_LABEL, TRIAL_CTA_LINK, whatsAppHref } from '@/components/landing/marketing/marketing-config';
import { authApi, getApiErrorMessage, onboardingApi } from '@/lib/api';
import {
  isAuthenticated,
  saveAuth,
  getPostLoginPath,
  getUser,
  shouldSkipAutoLogin,
  clearManualLoginRequired,
  markManualLoginRequired,
} from '@/lib/auth';
import './login-page.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-login-inter' });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-login-mono',
});

const schema = z.object({
  email: z.string().email('auth.errors.invalidEmail'),
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});

type FormData = z.infer<typeof schema>;

const isDev = process.env.NODE_ENV !== 'production';
const autoLoginEnabled =
  process.env.NEXT_PUBLIC_AUTO_LOGIN === 'true' ||
  (process.env.NEXT_PUBLIC_AUTO_LOGIN !== 'false' && isDev);
const AUTO_LOGIN_EMAIL = process.env.NEXT_PUBLIC_AUTO_LOGIN_EMAIL?.trim() || 'admin@fleet.com';
const AUTO_LOGIN_PASSWORD = process.env.NEXT_PUBLIC_AUTO_LOGIN_PASSWORD?.trim() || 'admin123';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLabel, setSsoLabel] = useState('Sign in with SSO');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const searchParams =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const wantsManualLogin = searchParams?.get('manual') === '1';

      if (wantsManualLogin) {
        markManualLoginRequired();
        setAutoLoggingIn(false);
      }

      if (isAuthenticated() && !wantsManualLogin) {
        const user = getUser();
        router.replace(getPostLoginPath(user?.role ?? 'office'));
        return;
      }

      const pendingMfaToken = searchParams?.get('mfa_token') ?? null;
      if (pendingMfaToken) {
        setMfaToken(pendingMfaToken);
        setAutoLoggingIn(false);
        return;
      }

      if (!wantsManualLogin && !shouldSkipAutoLogin()) {
        try {
          const status = await onboardingApi.status();
          if (cancelled) return;
          if (status.needs_setup) {
            router.replace('/onboarding');
            return;
          }
        } catch {
          // Backend unavailable — continue.
        }
      }

      if (shouldSkipAutoLogin()) {
        setAutoLoggingIn(false);
      }

      if (autoLoginEnabled && !shouldSkipAutoLogin()) {
        setAutoLoggingIn(true);
        try {
          const res = await authApi.signIn(AUTO_LOGIN_EMAIL, AUTO_LOGIN_PASSWORD);
          if (cancelled) return;
          if (res.mfa_required && res.mfa_token) {
            setMfaToken(res.mfa_token);
            setAutoLoggingIn(false);
            return;
          }
          const token = res.accessToken ?? res.access_token;
          if (token && res.user) {
            saveAuth(token, {
              ...res.user,
              name: res.user.name ?? res.user.email,
            });
            window.location.assign(getPostLoginPath(res.user.role));
            return;
          }
        } catch {
          if (cancelled) return;
          setAutoLoggingIn(false);
          return;
        }
      }

      if (cancelled) return;
      setAutoLoggingIn(false);

      authApi
        .oidcConfig()
        .then((config) => {
          if (cancelled) return;
          setSsoEnabled(config.enabled);
          setSsoLabel(config.label);
        })
        .catch(() => {
          if (cancelled) return;
          setSsoEnabled(false);
        });
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      const email = data.email.trim().toLowerCase();
      const res = await authApi.signIn(email, data.password);
      if (res.mfa_required && res.mfa_token) {
        setMfaToken(res.mfa_token);
        return;
      }
      const token = res.accessToken ?? res.access_token;
      if (!token || !res.user) {
        setError(t('auth.errors.noToken'));
        return;
      }
      saveAuth(token, {
        ...res.user,
        name: res.user.name ?? res.user.email,
      });
      clearManualLoginRequired();
      window.location.assign(getPostLoginPath(res.user.role));
    } catch (err) {
      if (err instanceof AxiosError) {
        if (!err.response) {
          setError(t('auth.errors.backendUnreachable'));
          return;
        }
        if (err.response.status === 401) {
          setError(t('auth.errors.invalidCredentials'));
          return;
        }
        if (err.response.status === 429) {
          setError(t('auth.errors.tooManyAttempts'));
          return;
        }
      }
      setError(getApiErrorMessage(err, t('auth.errors.unexpected')));
    }
  }

  async function onSubmitMfa() {
    if (!mfaToken || mfaCode.length !== 6) return;
    setError(null);
    setMfaSubmitting(true);
    try {
      const res = await authApi.verifyMfaLogin(mfaToken, mfaCode);
      const token = res.accessToken ?? res.access_token;
      if (!token || !res.user) {
        setError(t('auth.errors.noToken'));
        return;
      }
      saveAuth(token, {
        ...res.user,
        name: res.user.name ?? res.user.email,
      });
      clearManualLoginRequired();
      window.location.assign(getPostLoginPath(res.user.role));
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        setError(t('auth.mfa.invalidCode'));
        return;
      }
      setError(getApiErrorMessage(err, t('auth.errors.unexpected')));
    } finally {
      setMfaSubmitting(false);
    }
  }

  const credentialError = error?.includes('nicht korrekt');
  const tr = (key: string, fallback: string) => {
    const resolved = t(key);
    return resolved === key ? fallback : resolved;
  };

  const complianceRows = [
    {
      labelKey: 'auth.login.compliance.licenseChecks.label',
      valueKey: 'auth.login.compliance.licenseChecks.value',
      labelFallback: 'Führerscheinkontrolle',
      valueFallback: '✓ 43/44 geprüft',
      tone: 'ok' as const,
    },
    {
      labelKey: 'auth.login.compliance.cardReadout.label',
      valueKey: 'auth.login.compliance.cardReadout.value',
      labelFallback: 'Kartenauslesung (28-Tage)',
      valueFallback: 'in 6 Tagen · automatisch',
      tone: 'text' as const,
    },
    {
      labelKey: 'auth.login.compliance.huUvv.label',
      valueKey: 'auth.login.compliance.huUvv.value',
      labelFallback: 'HU / UVV',
      valueFallback: '2 fällig in 30 Tagen',
      tone: 'warn' as const,
    },
    {
      labelKey: 'auth.login.compliance.drivingViolations.label',
      valueKey: 'auth.login.compliance.drivingViolations.value',
      labelFallback: 'Lenkzeit-Verstöße',
      valueFallback: '0 diese Woche',
      tone: 'ok' as const,
    },
  ];

  if (autoLoggingIn) {
    return (
      <div className={`login-page ${inter.variable} ${ibmPlexMono.variable}`}>
        <main className="login-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="login-form-box" style={{ textAlign: 'center' }}>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#15498A]" />
            <p className="login-unter" style={{ marginTop: 16 }}>
              {tr('auth.login.autoSigningIn', 'Wird angemeldet…')}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`login-page ${inter.variable} ${ibmPlexMono.variable}`}>
      <aside className="login-marke" aria-hidden="true">
        <Link href="/" className="login-marke-logo">
          <Image
            src="/brand/operion-logo-navy.svg"
            alt="Operion"
            width={210}
            height={42}
            priority
            style={{ height: 42, width: 'auto' }}
          />
        </Link>

        <div className="login-marke-mitte">
          <h1>{tr('auth.login.headline', 'Ihre Flotte wartet schon.')}</h1>
          <p>{tr('auth.login.valueProp', 'Fristen, Lenkzeiten, Führerscheine — alles im Blick, bevor es teuer wird.')}</p>

          <div className="login-status-karte">
            <h3 className="login-status-titel">{tr('auth.login.compliance.title', 'Alles im Blick')}</h3>
            {complianceRows.map((row) => (
              <div key={row.labelKey} className="login-status-zeile">
                <span>{tr(row.labelKey, row.labelFallback)}</span>
                {row.tone === 'text' ? (
                  <b>{tr(row.valueKey, row.valueFallback)}</b>
                ) : (
                  <span className={`login-pill ${row.tone === 'warn' ? 'login-pill-warn' : 'login-pill-ok'}`}>
                    {tr(row.valueKey, row.valueFallback)}
                  </span>
                )}
              </div>
            ))}
            <span className="login-status-etiket">{tr('auth.login.compliance.sample', 'Beispielansicht')}</span>
          </div>
        </div>

        <div className="login-marke-fuss">
          {tr('auth.login.footerPrefix', 'Entwickelt mit einem Spediteur —')} <b>{tr('auth.login.footerStrong', '70 Fahrzeuge, 20 Jahre Erfahrung')}</b>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-form-box">
          <div className="login-mobil-logo">
            <Link href="/" aria-label="Operion">
              <Image
                src="/brand/operion-logo-navy.svg"
                alt="Operion"
                width={200}
                height={40}
                priority
                style={{ height: 40, width: 'auto' }}
              />
            </Link>
          </div>

          {mfaToken ? (
            <>
              <h2>{t('auth.mfa.title')}</h2>
              <p className="login-unter">{t('auth.mfa.description')}</p>

              <div className="login-feld">
                <label htmlFor="mfa-code">{t('auth.mfa.codeLabel')}</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                />
              </div>

              {error ? (
                <div className="login-fehler" role="alert">
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                className="login-btn"
                disabled={mfaSubmitting || mfaCode.length !== 6}
                onClick={() => void onSubmitMfa()}
              >
                {mfaSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('auth.mfa.verifying')}
                  </>
                ) : (
                  t('auth.mfa.verify')
                )}
              </button>

              <button
                type="button"
                className="login-sso-btn"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setMfaToken(null);
                  setMfaCode('');
                  setError(null);
                }}
              >
                {t('auth.mfa.back')}
              </button>
            </>
          ) : (
            <>
              <h2>{tr('auth.login.title', 'Willkommen zurück')}</h2>
              <p className="login-unter">{tr('auth.login.subtitle', 'Melden Sie sich an, um Ihre Flotte zu verwalten.')}</p>

              {error ? (
                <div className="login-fehler" role="alert">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="login-feld">
                  <label htmlFor="email">{tr('auth.login.emailLabel', 'Geschäftliche E-Mail')}</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder={tr('auth.login.emailPlaceholder', 'max@mustermann-transporte.de')}
                    className={errors.email || credentialError ? 'login-fehler-rand' : undefined}
                    {...register('email')}
                  />
                  {errors.email ? (
                    <p className="login-feld-fehler">{t(errors.email.message ?? '')}</p>
                  ) : null}
                </div>

                <div className="login-feld">
                  <label htmlFor="password">{tr('auth.login.passwordLabel', 'Passwort')}</label>
                  <div className="login-pw-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder={tr('auth.login.passwordPlaceholder', '••••••••••')}
                      className={errors.password || credentialError ? 'login-fehler-rand' : undefined}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      className="login-pw-auge"
                      aria-label={
                        showPassword
                          ? tr('auth.login.hidePasswordAria', 'Passwort verbergen')
                          : tr('auth.login.showPasswordAria', 'Passwort anzeigen')
                      }
                      onClick={() => setShowPassword((open) => !open)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password ? (
                    <p className="login-feld-fehler">{t(errors.password.message ?? '')}</p>
                  ) : null}
                </div>

                <div className="login-zeile">
                  <label className="login-merken">
                    <input type="checkbox" />
                    {tr('auth.login.rememberMe', 'Angemeldet bleiben')}
                  </label>
                  <Link href="/forgot-password" className="login-vergessen">
                    {tr('auth.login.forgotPassword', 'Passwort vergessen?')}
                  </Link>
                </div>

                <button type="submit" className="login-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tr('auth.login.signingIn', 'Wird angemeldet…')}
                    </>
                  ) : (
                    tr('auth.login.signIn', 'Anmelden')
                  )}
                </button>

                {ssoEnabled ? (
                  <>
                    <div className="login-trenner">{t('auth.sso.or')}</div>
                    <button
                      type="button"
                      className="login-sso-btn"
                      onClick={() => {
                        window.location.href = authApi.oidcLoginUrl();
                      }}
                    >
                      {ssoLabel}
                    </button>
                  </>
                ) : null}
              </form>

              <div className="login-trenner">{tr('auth.login.noAccount', 'Noch kein Konto?')}</div>
              <p className="login-registrieren">
                <Link href={TRIAL_CTA_LINK}>{TRIAL_CTA_LABEL} →</Link>
              </p>
            </>
          )}

          <div className="login-panel-fuss">
            <Link href="/impressum">{tr('auth.login.legal.impressum', 'Impressum')}</Link>
            <Link href="/datenschutz">{tr('auth.login.legal.privacy', 'Datenschutz')}</Link>
            <a href={whatsAppHref()} target="_blank" rel="noopener noreferrer">
              {tr('auth.login.legal.whatsAppHelp', 'Hilfe per WhatsApp')}
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
