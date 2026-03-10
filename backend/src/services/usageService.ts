import { db } from '../db/index.js';
import { subscriptions, usageRecords, organizations } from '../db/schema.js';
import { eq, and, sql, gte, lte } from 'drizzle-orm';

// Plan configurations
export const PLAN_CONFIG = {
  free: {
    monthlyMinutes: 100,
    maxAgents: 1,
    maxPhoneNumbers: 1,
    maxCampaigns: 1,
    liveMonitorEnabled: false,
    smsEnabled: false,
    dncEnabled: false,
    analyticsEnabled: false,
    prioritySupport: false,
  },
  pro: {
    monthlyMinutes: 4000,
    maxAgents: -1, // unlimited
    maxPhoneNumbers: 10,
    maxCampaigns: -1,
    liveMonitorEnabled: true,
    smsEnabled: true,
    dncEnabled: true,
    analyticsEnabled: true,
    prioritySupport: true,
  },
  enterprise: {
    monthlyMinutes: -1, // unlimited
    maxAgents: -1,
    maxPhoneNumbers: -1,
    maxCampaigns: -1,
    liveMonitorEnabled: true,
    smsEnabled: true,
    dncEnabled: true,
    analyticsEnabled: true,
    prioritySupport: true,
  },
} as const;

export type PlanType = keyof typeof PLAN_CONFIG;

interface UsageCheck {
  allowed: boolean;
  remaining: number;
  total: number;
  used: number;
  bonusRemaining: number;
  plan: string;
  reason?: string;
}

interface UsageSummary {
  subscription: any;
  minutesUsed: number;
  minutesTotal: number;
  minutesRemaining: number;
  percentUsed: number;
  bonusMinutes: number;
  bonusUsed: number;
  isUnlimited: boolean;
  daysLeftInPeriod: number;
  recentUsage: any[];
}

export class UsageService {
  /**
   * Ensure an organization has a subscription record.
   * Creates a free-tier subscription if none exists.
   */
  async ensureSubscription(organizationId: string) {
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    if (existing) return existing;

    // Create default free subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [sub] = await db.insert(subscriptions).values({
      organizationId,
      plan: 'free',
      status: 'active',
      monthlyMinutes: PLAN_CONFIG.free.monthlyMinutes,
      minutesUsed: 0,
      maxAgents: PLAN_CONFIG.free.maxAgents,
      maxPhoneNumbers: PLAN_CONFIG.free.maxPhoneNumbers,
      maxCampaigns: PLAN_CONFIG.free.maxCampaigns,
      liveMonitorEnabled: PLAN_CONFIG.free.liveMonitorEnabled,
      smsEnabled: PLAN_CONFIG.free.smsEnabled,
      dncEnabled: PLAN_CONFIG.free.dncEnabled,
      analyticsEnabled: PLAN_CONFIG.free.analyticsEnabled,
      prioritySupport: PLAN_CONFIG.free.prioritySupport,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }).returning();

    return sub;
  }

  /**
   * Check if an organization has enough minutes to place a call.
   * Returns whether the call is allowed and remaining balance.
   */
  async checkMinutes(organizationId: string): Promise<UsageCheck> {
    const sub = await this.ensureSubscription(organizationId);

    // Check if subscription is active
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      return {
        allowed: false,
        remaining: 0,
        total: sub.monthlyMinutes,
        used: sub.minutesUsed,
        bonusRemaining: Math.max(0, sub.bonusMinutes - sub.bonusMinutesUsed),
        plan: sub.plan,
        reason: `Subscription is ${sub.status}. Please renew to continue making calls.`,
      };
    }

    // Check if billing period has expired and needs reset
    if (new Date() > new Date(sub.currentPeriodEnd)) {
      await this.resetBillingPeriod(sub.id);
      return this.checkMinutes(organizationId); // re-check after reset
    }

    // Unlimited plan
    if (sub.monthlyMinutes === -1) {
      return {
        allowed: true,
        remaining: -1,
        total: -1,
        used: sub.minutesUsed,
        bonusRemaining: 0,
        plan: sub.plan,
      };
    }

    const monthlyRemaining = Math.max(0, sub.monthlyMinutes - sub.minutesUsed);
    const bonusRemaining = Math.max(0, sub.bonusMinutes - sub.bonusMinutesUsed);
    const totalRemaining = monthlyRemaining + bonusRemaining;

    if (totalRemaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        total: sub.monthlyMinutes,
        used: sub.minutesUsed,
        bonusRemaining: 0,
        plan: sub.plan,
        reason: 'Monthly minutes exhausted. Upgrade your plan or purchase additional minutes.',
      };
    }

    return {
      allowed: true,
      remaining: totalRemaining,
      total: sub.monthlyMinutes,
      used: sub.minutesUsed,
      bonusRemaining,
      plan: sub.plan,
    };
  }

  /**
   * Record minutes consumed by a call.
   * Called when a call ends (from webhook).
   */
  async recordUsage(
    organizationId: string,
    callId: string,
    durationSeconds: number,
    options?: { campaignId?: string; description?: string }
  ): Promise<{ minutesCharged: number; fromBonus: boolean }> {
    const sub = await this.ensureSubscription(organizationId);

    // Round up to nearest minute (industry standard billing)
    const minutesCharged = Math.ceil(durationSeconds / 60);
    if (minutesCharged <= 0) return { minutesCharged: 0, fromBonus: false };

    // Unlimited plan — still record for analytics but don't enforce
    if (sub.monthlyMinutes === -1) {
      await db.insert(usageRecords).values({
        organizationId,
        subscriptionId: sub.id,
        callId,
        campaignId: options?.campaignId || null,
        minutesUsed: minutesCharged,
        secondsUsed: durationSeconds,
        source: 'call',
        description: options?.description || `Call ${callId}`,
        fromBonus: false,
      });

      // Still increment minutesUsed for reporting
      await db.update(subscriptions)
        .set({ minutesUsed: sql`${subscriptions.minutesUsed} + ${minutesCharged}` })
        .where(eq(subscriptions.id, sub.id));

      return { minutesCharged, fromBonus: false };
    }

    // Determine whether to charge from monthly or bonus
    const monthlyRemaining = Math.max(0, sub.monthlyMinutes - sub.minutesUsed);
    let fromBonus = false;

    if (monthlyRemaining >= minutesCharged) {
      // Charge from monthly
      await db.update(subscriptions)
        .set({ minutesUsed: sql`${subscriptions.minutesUsed} + ${minutesCharged}` })
        .where(eq(subscriptions.id, sub.id));
    } else if (monthlyRemaining > 0) {
      // Split: some from monthly, rest from bonus
      const fromMonthly = monthlyRemaining;
      const fromBonusAmount = minutesCharged - fromMonthly;

      await db.update(subscriptions)
        .set({
          minutesUsed: sql`${subscriptions.minutesUsed} + ${fromMonthly}`,
          bonusMinutesUsed: sql`${subscriptions.bonusMinutesUsed} + ${fromBonusAmount}`,
        })
        .where(eq(subscriptions.id, sub.id));
      fromBonus = true;
    } else {
      // All from bonus
      await db.update(subscriptions)
        .set({ bonusMinutesUsed: sql`${subscriptions.bonusMinutesUsed} + ${minutesCharged}` })
        .where(eq(subscriptions.id, sub.id));
      fromBonus = true;
    }

    // Record the usage
    await db.insert(usageRecords).values({
      organizationId,
      subscriptionId: sub.id,
      callId,
      campaignId: options?.campaignId || null,
      minutesUsed: minutesCharged,
      secondsUsed: durationSeconds,
      source: 'call',
      description: options?.description || `Call ${callId}`,
      fromBonus,
    });

    return { minutesCharged, fromBonus };
  }

  /**
   * Get detailed usage summary for an organization.
   */
  async getUsageSummary(organizationId: string): Promise<UsageSummary> {
    const sub = await this.ensureSubscription(organizationId);

    // Check if period needs reset
    if (new Date() > new Date(sub.currentPeriodEnd)) {
      await this.resetBillingPeriod(sub.id);
      return this.getUsageSummary(organizationId);
    }

    const isUnlimited = sub.monthlyMinutes === -1;
    const minutesRemaining = isUnlimited ? -1 : Math.max(0, sub.monthlyMinutes - sub.minutesUsed + sub.bonusMinutes - sub.bonusMinutesUsed);
    const total = isUnlimited ? sub.minutesUsed : sub.monthlyMinutes + sub.bonusMinutes;
    const percentUsed = isUnlimited ? 0 : total > 0 ? Math.round((sub.minutesUsed + sub.bonusMinutesUsed) / total * 100) : 0;

    const daysLeft = Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    // Recent usage records
    const recentUsage = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organizationId, organizationId),
          gte(usageRecords.recordedAt, sub.currentPeriodStart),
        )
      )
      .orderBy(sql`${usageRecords.recordedAt} DESC`)
      .limit(50);

    return {
      subscription: sub,
      minutesUsed: sub.minutesUsed + sub.bonusMinutesUsed,
      minutesTotal: total,
      minutesRemaining,
      percentUsed,
      bonusMinutes: sub.bonusMinutes,
      bonusUsed: sub.bonusMinutesUsed,
      isUnlimited,
      daysLeftInPeriod: daysLeft,
      recentUsage,
    };
  }

  /**
   * Upgrade or change a subscription plan.
   */
  async changePlan(organizationId: string, newPlan: PlanType): Promise<any> {
    const sub = await this.ensureSubscription(organizationId);
    const config = PLAN_CONFIG[newPlan];

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [updated] = await db.update(subscriptions)
      .set({
        plan: newPlan,
        status: 'active',
        monthlyMinutes: config.monthlyMinutes,
        minutesUsed: 0, // Reset on plan change
        maxAgents: config.maxAgents,
        maxPhoneNumbers: config.maxPhoneNumbers,
        maxCampaigns: config.maxCampaigns,
        liveMonitorEnabled: config.liveMonitorEnabled,
        smsEnabled: config.smsEnabled,
        dncEnabled: config.dncEnabled,
        analyticsEnabled: config.analyticsEnabled,
        prioritySupport: config.prioritySupport,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();

    return updated;
  }

  /**
   * Add bonus minutes to a subscription.
   */
  async addBonusMinutes(organizationId: string, minutes: number): Promise<any> {
    const sub = await this.ensureSubscription(organizationId);

    const [updated] = await db.update(subscriptions)
      .set({
        bonusMinutes: sql`${subscriptions.bonusMinutes} + ${minutes}`,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();

    return updated;
  }

  /**
   * Reset billing period (called when period expires).
   */
  private async resetBillingPeriod(subscriptionId: string) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db.update(subscriptions)
      .set({
        minutesUsed: 0,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));
  }

  /**
   * Check feature access for a plan.
   */
  async checkFeatureAccess(organizationId: string, feature: string): Promise<boolean> {
    const sub = await this.ensureSubscription(organizationId);

    switch (feature) {
      case 'live_monitor': return sub.liveMonitorEnabled;
      case 'sms': return sub.smsEnabled;
      case 'dnc': return sub.dncEnabled;
      case 'analytics': return sub.analyticsEnabled;
      case 'priority_support': return sub.prioritySupport;
      default: return true;
    }
  }
}

// Singleton export
export const usageService = new UsageService();
