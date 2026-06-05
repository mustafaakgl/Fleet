import { Injectable, Logger } from '@nestjs/common';
import { BillingPlan } from '@prisma/client';
import Stripe from 'stripe';
import { getFrontendUrl } from '../config/env.validation';
import { getStripePriceId, isStripeEnabled } from './billing-plans';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: InstanceType<typeof Stripe> | null = null;

  isEnabled(): boolean {
    return isStripeEnabled();
  }

  private getClient(): InstanceType<typeof Stripe> {
    if (!this.client) {
      const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
      if (!secretKey) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
      }
      this.client = new Stripe(secretKey);
    }
    return this.client;
  }

  async createCheckoutSession(params: {
    tenantId: string;
    plan: BillingPlan;
    billingEmail: string;
    stripeCustomerId?: string | null;
  }): Promise<{ url: string; sessionId: string }> {
    const priceId = getStripePriceId(params.plan);
    if (!priceId) {
      throw new Error(`Stripe price ID not configured for plan ${params.plan}`);
    }

    const frontendUrl = getFrontendUrl().replace(/\/$/, '');
    const stripe = this.getClient();

    const automaticTax =
      (process.env.STRIPE_AUTOMATIC_TAX ?? '').toLowerCase() === 'true';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      locale: 'de',
      customer: params.stripeCustomerId ?? undefined,
      customer_email: params.stripeCustomerId ? undefined : params.billingEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: ['sepa_debit', 'card'],
      success_url: `${frontendUrl}/billing?checkout=success`,
      cancel_url: `${frontendUrl}/billing?checkout=canceled`,
      metadata: {
        tenantId: params.tenantId,
        plan: params.plan,
      },
      subscription_data: {
        metadata: {
          tenantId: params.tenantId,
          plan: params.plan,
        },
      },
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true,
        required: 'if_supported',
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: 'MyFleet SaaS-Abonnement',
          metadata: {
            tenantId: params.tenantId,
            plan: params.plan,
          },
        },
      },
      automatic_tax: automaticTax ? { enabled: true } : undefined,
      custom_text: {
        submit: {
          message:
            'Mit Abschluss stimmen Sie der monatlichen Abrechnung per SEPA-Lastschrift oder Karte zu. USt-IdNr. wird bei B2B-Kunden abgefragt.',
        },
      },
      customer_update: params.stripeCustomerId
        ? { address: 'auto', name: 'auto' }
        : undefined,
    });

    if (!session.url) {
      throw new Error('Stripe checkout session has no URL');
    }

    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
    const frontendUrl = getFrontendUrl().replace(/\/$/, '');
    const stripe = this.getClient();

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${frontendUrl}/billing`,
      locale: 'de',
    });

    return { url: session.url };
  }

  constructWebhookEvent(payload: Buffer, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    return this.getClient().webhooks.constructEvent(payload, signature, webhookSecret);
  }

  async retrieveSubscription(subscriptionId: string) {
    return this.getClient().subscriptions.retrieve(subscriptionId);
  }

  logDisabled(action: string): void {
    this.logger.warn(`Stripe disabled — skipped ${action}`);
  }
}
