/**
 * Verify Stripe configuration before production deploy.
 * Usage: npm run verify:stripe  (from backend/)
 */
import 'dotenv/config';
import Stripe from 'stripe';

function fail(message: string): never {
  console.error(`[verify-stripe] FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const enabled = (process.env.STRIPE_ENABLED ?? '').toLowerCase() === 'true';
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!enabled) fail('STRIPE_ENABLED is not true');
  if (!secretKey) fail('STRIPE_SECRET_KEY is empty');
  if (!webhookSecret) fail('STRIPE_WEBHOOK_SECRET is empty');

  const stripe = new Stripe(secretKey);
  const account = await stripe.accounts.retrieve();

  console.log(`[verify-stripe] Account: ${account.id}`);
  console.log(`[verify-stripe] Country: ${account.country ?? 'n/a'}`);
  console.log(`[verify-stripe] Charges enabled: ${account.charges_enabled}`);

  const priceVars = ['STRIPE_PRICE_BASIC', 'STRIPE_PRICE_PRO', 'STRIPE_PRICE_ENTERPRISE'] as const;
  for (const envKey of priceVars) {
    const priceId = process.env[envKey]?.trim();
    if (!priceId) {
      console.warn(`[verify-stripe] WARN: ${envKey} not set`);
      continue;
    }
    const price = await stripe.prices.retrieve(priceId);
    console.log(
      `[verify-stripe] ${envKey}=${priceId} (${price.currency} ${(price.unit_amount ?? 0) / 100}/month)`,
    );
  }

  console.log('[verify-stripe] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
