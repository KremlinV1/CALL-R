import { db } from '../db/index.js';
import { callerIdProfiles } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────

export interface CallerIdResult {
  profileId: string;
  displayNumber: string;
  displayName: string | null;
  mode: string;        // 'owned' | 'custom'
  profileName: string;
}

interface ResolveOptions {
  organizationId: string;
  toNumber: string;              // The number being called (for area-code matching)
  agentId?: string;
  campaignId?: string;
  explicitProfileId?: string;    // If user explicitly chose a profile
}

// ─── Caller ID Resolution Engine ────────────────────────────────────

/**
 * Resolve which caller ID profile to use for an outbound call.
 *
 * Priority order:
 *   1. Explicit profile ID (user selected)
 *   2. Area-code match for destination number
 *   3. Agent-specific profile
 *   4. Campaign-specific profile
 *   5. Organization default profile
 *   6. null (use the raw fromNumber as before)
 */
export async function resolveCallerId(options: ResolveOptions): Promise<CallerIdResult | null> {
  const { organizationId, toNumber, agentId, campaignId, explicitProfileId } = options;

  // 1. Explicit profile
  if (explicitProfileId) {
    const [profile] = await db
      .select()
      .from(callerIdProfiles)
      .where(and(
        eq(callerIdProfiles.id, explicitProfileId),
        eq(callerIdProfiles.organizationId, organizationId),
        eq(callerIdProfiles.isActive, true),
      ))
      .limit(1);

    if (profile) {
      await incrementUsage(profile.id);
      return toResult(profile);
    }
  }

  // Load all active profiles for this org
  const profiles = await db
    .select()
    .from(callerIdProfiles)
    .where(and(
      eq(callerIdProfiles.organizationId, organizationId),
      eq(callerIdProfiles.isActive, true),
    ))
    .orderBy(desc(callerIdProfiles.priority));

  if (profiles.length === 0) return null;

  // Extract area code from destination number
  const destAreaCode = extractAreaCode(toNumber);

  // 2. Area-code match
  if (destAreaCode) {
    const areaMatch = profiles.find(p => {
      const codes = (p.matchAreaCodes as string[]) || [];
      return codes.length > 0 && codes.includes(destAreaCode);
    });
    if (areaMatch) {
      await incrementUsage(areaMatch.id);
      return toResult(areaMatch);
    }
  }

  // 3. Agent-specific
  if (agentId) {
    const agentMatch = profiles.find(p => {
      const ids = (p.agentIds as string[]) || [];
      return ids.length > 0 && ids.includes(agentId);
    });
    if (agentMatch) {
      await incrementUsage(agentMatch.id);
      return toResult(agentMatch);
    }
  }

  // 4. Campaign-specific
  if (campaignId) {
    const campaignMatch = profiles.find(p => {
      const ids = (p.campaignIds as string[]) || [];
      return ids.length > 0 && ids.includes(campaignId);
    });
    if (campaignMatch) {
      await incrementUsage(campaignMatch.id);
      return toResult(campaignMatch);
    }
  }

  // 5. Organization default
  const defaultProfile = profiles.find(p => p.isDefault);
  if (defaultProfile) {
    await incrementUsage(defaultProfile.id);
    return toResult(defaultProfile);
  }

  // 6. Highest priority profile as fallback
  const fallback = profiles[0];
  if (fallback) {
    await incrementUsage(fallback.id);
    return toResult(fallback);
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractAreaCode(phone: string): string | null {
  // Strip to digits
  const digits = phone.replace(/\D/g, '');
  // US/CA: +1XXXYYYZZZZ → area code = XXX (digits 1-3 after country code)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1, 4);
  }
  if (digits.length === 10) {
    return digits.substring(0, 3);
  }
  return null;
}

function toResult(profile: any): CallerIdResult {
  return {
    profileId: profile.id,
    displayNumber: profile.displayNumber,
    displayName: profile.displayName,
    mode: profile.mode,
    profileName: profile.name,
  };
}

async function incrementUsage(profileId: string) {
  try {
    await db
      .update(callerIdProfiles)
      .set({
        usageCount: (await db
          .select({ usageCount: callerIdProfiles.usageCount })
          .from(callerIdProfiles)
          .where(eq(callerIdProfiles.id, profileId))
          .limit(1)
          .then(r => (r[0]?.usageCount || 0) + 1)),
        updatedAt: new Date(),
      })
      .where(eq(callerIdProfiles.id, profileId));
  } catch {
    // Non-critical — don't fail the call over a counter
  }
}
