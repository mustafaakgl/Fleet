'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { TRIAL_CTA_LABEL, TRIAL_CTA_LINK, whatsAppHref } from '@/components/landing/marketing/marketing-config';
import { authApi, onboardingApi } from '@/lib/api';
import { isAuthenticated, saveAuth, MOCK_CURRENT_USER, getPostLoginPath, getUser } from '@/lib/auth';
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
  const [autoLoggingIn, setAutoLoggingIn] = useState(autoLoginEnabled);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLabel, setSsoLabel] = useState('Sign in with SSO');

  function loginWithDemo() {
    saveAuth('dev-demo-token', { ...MOCK_CURRENT_USER, role: 'admin', name: 'Demo Admin' });
    router.replace('/dashboard');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (isAuthenticated()) {
        const user = getUser();
        router.replace(getPostLoginPath(user?.role ?? 'office'));
        return;
      }

      const pendingMfaToken =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('mfa_token')
          : null;
      if (pendingMfaToken) {
        setMfaToken(pendingMfaToken);
        setAutoLoggingIn(false);
        return;
      }

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

      if (autoLoginEnabled) {
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
            router.replace(getPostLoginPath(res.user.role));
            return;
          }
        } catch {
          if (cancelled) return;
          loginWithDemo();
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
      router.push(getPostLoginPath(res.user.role));
    } catch (err) {
      if (err instanceof AxiosError) {
        if (!err.response) {
          setError(t('auth.errors.backendUnreachable'));
          return;
        }
        if (err.response.status === 401) {
          setError('E-Mail oder Passwort ist nicht korrekt. Bitte prüfen Sie Ihre Eingabe.');
          return;
        }
        if (err.response.status === 429) {
          setError(t('auth.errors.tooManyAttempts'));
          return;
        }
      }
      setError(t('auth.errors.unexpected'));
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
      router.push(getPostLoginPath(res.user.role));
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        setError(t('auth.mfa.invalidCode'));
        return;
      }
      setError(t('auth.errors.unexpected'));
    } finally {
      setMfaSubmitting(false);
    }
  }

  const credentialError = error?.includes('nicht korrekt');

  if (autoLoggingIn) {
    return (
      <div className={`login-page ${inter.variable} ${ibmPlexMono.variable}`}>
        <main className="login-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="login-form-box" style={{ textAlign: 'center' }}>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#15498A]" />
            <p className="login-unter" style={{ marginTop: 16 }}>
              Wird angemeldet…
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
          <MyFleetLogo height={36} href={null} priority />
        </Link>

        <div className="login-marke-mitte">
          <h1>Ihre Flotte wartet schon.</h1>
          <p>
            Fristen, Dokumente und Fahrer-Nachrichten — alles, was heute passiert ist, sehen Sie gleich auf
            einen Blick.
          </p>

          <div className="login-status-karte">
            <div className="login-status-zeile">
              <span>Fahrzeuge einsatzbereit</span>
              <b>68 / 70</b>
            </div>
            <div className="login-status-zeile">
              <span>HU · M-KL 482</span>
              <span className="login-pill login-pill-warn">in 21 Tagen</span>
            </div>
            <div className="login-status-zeile">
              <span>Neue Dokumente heute</span>
              <b>14</b>
            </div>
            <div className="login-status-zeile">
              <span>Alle Systeme</span>
              <span className="login-pill login-pill-ok">● Betriebsbereit</span>
            </div>
          </div>
        </div>

        <div className="login-marke-fuss">
          Entwickelt mit einem Spediteur — <b>70 Fahrzeuge, 20 Jahre Erfahrung</b>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-form-box">
          <div className="login-mobil-logo">
            <MyFleetLogo height={40} href="/" priority />
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
              <h2>Willkommen zurück</h2>
              <p className="login-unter">Melden Sie sich an, um Ihre Flotte zu verwalten.</p>

              {error ? (
                <div className="login-fehler" role="alert">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="login-feld">
                  <label htmlFor="email">Geschäftliche E-Mail</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="max@mustermann-transporte.de"
                    className={errors.email || credentialError ? 'login-fehler-rand' : undefined}
                    {...register('email')}
                  />
                  {errors.email ? (
                    <p className="login-feld-fehler">{t(errors.email.message ?? '')}</p>
                  ) : null}
                </div>

                <div className="login-feld">
                  <label htmlFor="password">Passwort</label>
                  <div className="login-pw-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••••"
                      className={errors.password || credentialError ? 'login-fehler-rand' : undefined}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      className="login-pw-auge"
                      aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
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
                    Angemeldet bleiben
                  </label>
                  <Link href="/forgot-password" className="login-vergessen">
                    Passwort vergessen?
                  </Link>
                </div>

                <button type="submit" className="login-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Wird angemeldet…
                    </>
                  ) : (
                    'Anmelden'
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

              <div className="login-trenner">Noch kein Konto?</div>
              <p className="login-registrieren">
                <Link href={TRIAL_CTA_LINK}>{TRIAL_CTA_LABEL} →</Link>
              </p>
            </>
          )}

          <div className="login-panel-fuss">
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <a href={whatsAppHref()} target="_blank" rel="noopener noreferrer">
              Hilfe per WhatsApp
            </a>
          </div>

          {!mfaToken && isDev ? (
            <div className="login-dev-block">
              <p>Dev only</p>
              <button type="button" className="login-dev-btn" onClick={loginWithDemo}>
                Demo login (no backend)
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
