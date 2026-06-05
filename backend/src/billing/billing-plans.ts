import { BillingPlan } from '@prisma/client';

export type BillingPlanDefinition = {
  id: BillingPlan;
  name_de: string;
  name_en: string;
  monthly_amount_cents: number;
  vehicle_limit: number;
  seat_limit: number;
  stripe_price_env: string;
  features_de: string[];
};

export const BILLING_PLANS: Record<BillingPlan, BillingPlanDefinition> = {
  basic: {
    id: 'basic',
    name_de: 'Basic',
    name_en: 'Basic',
    monthly_amount_cents: 29_900,
    vehicle_limit: 15,
    seat_limit: 5,
    stripe_price_env: 'STRIPE_PRICE_BASIC',
    features_de: [
      'Bis 15 Fahrzeuge',
      '5 Benutzerkonten',
      'Einsatzplan & Stammdaten',
      'DSGVO-Compliance-Basis',
    ],
  },
  pro: {
    id: 'pro',
    name_de: 'Professional',
    name_en: 'Professional',
    monthly_amount_cents: 39_900,
    vehicle_limit: 50,
    seat_limit: 15,
    stripe_price_env: 'STRIPE_PRICE_PRO',
    features_de: [
      'Bis 50 Fahrzeuge',
      '15 Benutzerkonten',
      'Live-Tracking & Messenger',
      'Vorfälle & Kalender',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name_de: 'Enterprise',
    name_en: 'Enterprise',
    monthly_amount_cents: 50_000,
    vehicle_limit: 200,
    seat_limit: 50,
    stripe_price_env: 'STRIPE_PRICE_ENTERPRISE',
    features_de: [
      'Bis 200 Fahrzeuge',
      '50 Benutzerkonten',
      'SLA & Integrationen',
      'Dediziertes Onboarding',
    ],
  },
};

export const TRIAL_DAYS = 14;

export function getStripePriceId(plan: BillingPlan): string | null {
  const envKey = BILLING_PLANS[plan].stripe_price_env;
  const value = process.env[envKey]?.trim();
  return value || null;
}

export function isStripeEnabled(): boolean {
  return (process.env.STRIPE_ENABLED ?? '').toLowerCase() === 'true'
    && !!process.env.STRIPE_SECRET_KEY?.trim();
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
