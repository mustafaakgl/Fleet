import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingMode,
  BillingPlan,
  BillingStatus,
  TenantSubscription,
} from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_PLANS, TRIAL_DAYS, formatEuro, isStripeEnabled } from './billing-plans';
import { StripeService } from './stripe.service';
import { CreateManualBillingDto } from './dto/create-manual-billing.dto';
import { StartCheckoutDto } from './dto/start-checkout.dto';

const ACTIVE_STATUSES: BillingStatus[] = [
  BillingStatus.trialing,
  BillingStatus.active,
  BillingStatus.manual,
];

function toClientSubscription(row: TenantSubscription) {
  const planDef = BILLING_PLANS[row.plan];
  return {
    id: row.id,
    tenant_id: row.tenantId,
    plan: row.plan,
    plan_name_de: planDef.name_de,
    plan_name_en: planDef.name_en,
    status: row.status,
    billing_mode: row.billingMode,
    vehicle_limit: row.vehicleLimit,
    seat_limit: row.seatLimit,
    monthly_amount_cents: row.monthlyAmountCents,
    monthly_amount_formatted: formatEuro(row.monthlyAmountCents),
    billing_email: row.billingEmail ?? undefined,
    manual_invoice_reference: row.manualInvoiceReference ?? undefined,
    trial_ends_at: row.trialEndsAt?.toISOString(),
    current_period_start: row.currentPeriodStart?.toISOString(),
    current_period_end: row.currentPeriodEnd?.toISOString(),
    canceled_at: row.canceledAt?.toISOString(),
    stripe_configured: isStripeEnabled(),
    features_de: planDef.features_de,
  };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly auditService: AuditService,
  ) {}

  async ensureSubscriptionForTenant(tenantId: string, billingEmail?: string) {
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (existing) {
      return existing;
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const basic = BILLING_PLANS.basic;

    return this.prisma.tenantSubscription.create({
      data: {
        tenantId,
        plan: BillingPlan.basic,
        status: BillingStatus.trialing,
        billingMode: BillingMode.stripe,
        vehicleLimit: basic.vehicle_limit,
        seatLimit: basic.seat_limit,
        monthlyAmountCents: basic.monthly_amount_cents,
        billingEmail: billingEmail?.trim().toLowerCase(),
        trialEndsAt,
      },
    });
  }

  async getPlans() {
    return Object.values(BILLING_PLANS).map((plan) => ({
      id: plan.id,
      name_de: plan.name_de,
      name_en: plan.name_en,
      monthly_amount_cents: plan.monthly_amount_cents,
      monthly_amount_formatted: formatEuro(plan.monthly_amount_cents),
      vehicle_limit: plan.vehicle_limit,
      seat_limit: plan.seat_limit,
      features_de: plan.features_de,
      stripe_available: isStripeEnabled() && !!process.env[plan.stripe_price_env]?.trim(),
    }));
  }

  async getStatus(tenantId: string | undefined) {
    if (!tenantId) {
      throw new NotFoundException('No tenant assigned to this user');
    }

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (!subscription) {
      const created = await this.ensureSubscriptionForTenant(tenantId);
      return this.buildStatusResponse(created);
    }

    return this.buildStatusResponse(subscription);
  }

  private async buildStatusResponse(subscription: TenantSubscription) {
    const [vehicleCount, seatCount] = await Promise.all([
      this.countVehicles(),
      this.countSeats(subscription.tenantId),
    ]);

    const isActive = ACTIVE_STATUSES.includes(subscription.status);
    const withinLimits =
      vehicleCount <= subscription.vehicleLimit && seatCount <= subscription.seatLimit;

    return {
      subscription: toClientSubscription(subscription),
      usage: {
        vehicles: vehicleCount,
        seats: seatCount,
        vehicle_limit: subscription.vehicleLimit,
        seat_limit: subscription.seatLimit,
        vehicles_remaining: Math.max(0, subscription.vehicleLimit - vehicleCount),
        seats_remaining: Math.max(0, subscription.seatLimit - seatCount),
      },
      access: {
        is_active: isActive,
        within_limits: withinLimits,
        can_add_vehicle: isActive && vehicleCount < subscription.vehicleLimit,
        can_add_seat: isActive && seatCount < subscription.seatLimit,
      },
    };
  }

  private async countVehicles(): Promise<number> {
    return this.prisma.vehicle.count({
      where: { status: { not: 'inactive' } },
    });
  }

  private async countSeats(tenantId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        status: 'active',
        role: { not: 'driver' },
      },
    });
  }

  async assertCanAddVehicle(tenantId: string | undefined): Promise<void> {
    if (!tenantId) return;

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (!subscription || !ACTIVE_STATUSES.includes(subscription.status)) {
      return;
    }

    const vehicleCount = await this.countVehicles();
    if (vehicleCount >= subscription.vehicleLimit) {
      throw new HttpException(
        `Vehicle limit reached (${subscription.vehicleLimit}). Upgrade your plan.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async assertCanAddSeat(tenantId: string | undefined): Promise<void> {
    if (!tenantId) return;

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (!subscription || !ACTIVE_STATUSES.includes(subscription.status)) {
      return;
    }

    const seatCount = await this.countSeats(tenantId);
    if (seatCount >= subscription.seatLimit) {
      throw new HttpException(
        `Seat limit reached (${subscription.seatLimit}). Upgrade your plan.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async startCheckout(
    tenantId: string | undefined,
    actorUserId: string,
    dto: StartCheckoutDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context required');
    }
    if (!this.stripeService.isEnabled()) {
      throw new BadRequestException('Stripe billing is not enabled');
    }

    const planDef = BILLING_PLANS[dto.plan];
    if (!planDef) {
      throw new BadRequestException('Invalid plan');
    }

    let subscription = await this.ensureSubscriptionForTenant(tenantId, dto.billing_email);
    subscription = await this.prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        plan: dto.plan,
        vehicleLimit: planDef.vehicle_limit,
        seatLimit: planDef.seat_limit,
        monthlyAmountCents: planDef.monthly_amount_cents,
        billingEmail: dto.billing_email.trim().toLowerCase(),
        billingMode: BillingMode.stripe,
      },
    });

    const session = await this.stripeService.createCheckoutSession({
      tenantId,
      plan: dto.plan,
      billingEmail: subscription.billingEmail!,
      stripeCustomerId: subscription.stripeCustomerId,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'billing.checkout_started',
      entityType: 'tenant_subscription',
      entityId: subscription.id,
      summary: 'Stripe checkout session created',
      metadata: { plan: dto.plan },
    });

    return session;
  }

  async createPortalSession(tenantId: string | undefined, actorUserId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context required');
    }
    if (!this.stripeService.isEnabled()) {
      throw new BadRequestException('Stripe billing is not enabled');
    }

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer linked yet');
    }

    const session = await this.stripeService.createPortalSession(subscription.stripeCustomerId);

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'billing.portal_opened',
      entityType: 'tenant_subscription',
      entityId: subscription.id,
      summary: 'Stripe customer portal opened',
    });

    return session;
  }

  async setManualBilling(actorUserId: string, dto: CreateManualBillingDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenant_id },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const planDef = BILLING_PLANS[dto.plan];
    const subscription = await this.prisma.tenantSubscription.upsert({
      where: { tenantId: dto.tenant_id },
      create: {
        tenantId: dto.tenant_id,
        plan: dto.plan,
        status: BillingStatus.manual,
        billingMode: BillingMode.manual,
        vehicleLimit: dto.vehicle_limit ?? planDef.vehicle_limit,
        seatLimit: dto.seat_limit ?? planDef.seat_limit,
        monthlyAmountCents: dto.monthly_amount_cents ?? planDef.monthly_amount_cents,
        billingEmail: dto.billing_email?.trim().toLowerCase(),
        manualInvoiceReference: dto.invoice_reference?.trim(),
      },
      update: {
        plan: dto.plan,
        status: BillingStatus.manual,
        billingMode: BillingMode.manual,
        vehicleLimit: dto.vehicle_limit ?? planDef.vehicle_limit,
        seatLimit: dto.seat_limit ?? planDef.seat_limit,
        monthlyAmountCents: dto.monthly_amount_cents ?? planDef.monthly_amount_cents,
        billingEmail: dto.billing_email?.trim().toLowerCase(),
        manualInvoiceReference: dto.invoice_reference?.trim(),
        canceledAt: null,
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'billing.manual_activated',
      entityType: 'tenant_subscription',
      entityId: subscription.id,
      summary: 'Manual billing plan activated',
      metadata: {
        plan: dto.plan,
        invoice_reference: dto.invoice_reference,
      },
    });

    return toClientSubscription(subscription);
  }

  async handleStripeWebhook(payload: Buffer, signature: string) {
    const event = this.stripeService.constructWebhookEvent(payload, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as unknown as Record<string, unknown>);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await this.onSubscriptionUpdated(event.data.object as unknown as Record<string, unknown>);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as unknown as Record<string, unknown>);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as unknown as Record<string, unknown>);
        break;
      default:
        break;
    }

    return { received: true, type: event.type };
  }

  private async onCheckoutCompleted(session: Record<string, unknown>) {
    const metadata = session.metadata as { tenantId?: string } | undefined;
    const tenantId = metadata?.tenantId;
    if (!tenantId) return;

    const customer = session.customer as string | { id: string } | null | undefined;
    const subscription = session.subscription as string | { id: string } | null | undefined;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    const subscriptionId =
      typeof subscription === 'string' ? subscription : subscription?.id;

    await this.prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: {
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        billingMode: BillingMode.stripe,
      },
    });

    if (subscriptionId) {
      const stripeSub = await this.stripeService.retrieveSubscription(subscriptionId);
      await this.syncStripeSubscription(stripeSub as unknown as Record<string, unknown>);
    }
  }

  private async onSubscriptionUpdated(stripeSub: Record<string, unknown>) {
    await this.syncStripeSubscription(stripeSub);
  }

  private async onSubscriptionDeleted(stripeSub: Record<string, unknown>) {
    const metadata = stripeSub.metadata as { tenantId?: string } | undefined;
    const tenantId = metadata?.tenantId;
    if (!tenantId) return;

    await this.prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: {
        status: BillingStatus.canceled,
        canceledAt: new Date(),
      },
    });
  }

  private async onPaymentFailed(invoice: Record<string, unknown>) {
    const customer = invoice.customer as string | { id: string } | null | undefined;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (!customerId) return;

    await this.prisma.tenantSubscription.updateMany({
      where: { stripeCustomerId: customerId },
      data: { status: BillingStatus.past_due },
    });
  }

  private async syncStripeSubscription(stripeSub: Record<string, unknown>) {
    const metadata = stripeSub.metadata as { tenantId?: string; plan?: BillingPlan } | undefined;
    const tenantId = metadata?.tenantId;
    if (!tenantId) return;

    const planMeta = metadata?.plan;
    const plan = planMeta && BILLING_PLANS[planMeta] ? planMeta : BillingPlan.basic;
    const planDef = BILLING_PLANS[plan];

    const status = this.mapStripeStatus(String(stripeSub.status ?? 'active'));
    const customer = stripeSub.customer as string | { id: string } | null | undefined;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    const items = stripeSub.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
    const priceId = items?.data?.[0]?.price?.id;
    const currentPeriodStart = Number(stripeSub.current_period_start ?? 0);
    const currentPeriodEnd = Number(stripeSub.current_period_end ?? 0);
    const canceledAtRaw = stripeSub.canceled_at as number | null | undefined;

    await this.prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: {
        plan,
        status,
        billingMode: BillingMode.stripe,
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: String(stripeSub.id ?? ''),
        stripePriceId: priceId ?? undefined,
        vehicleLimit: planDef.vehicle_limit,
        seatLimit: planDef.seat_limit,
        monthlyAmountCents: planDef.monthly_amount_cents,
        currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : undefined,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : undefined,
        canceledAt: canceledAtRaw ? new Date(canceledAtRaw * 1000) : null,
      },
    });
  }

  private mapStripeStatus(status: string): BillingStatus {
    switch (status) {
      case 'trialing':
        return BillingStatus.trialing;
      case 'active':
        return BillingStatus.active;
      case 'past_due':
        return BillingStatus.past_due;
      case 'canceled':
        return BillingStatus.canceled;
      case 'unpaid':
        return BillingStatus.unpaid;
      default:
        return BillingStatus.active;
    }
  }
}
