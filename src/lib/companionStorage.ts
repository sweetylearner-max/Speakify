"use client";
/**
 * Persists the companion's learned interest profile in localStorage.
 * The profile is a simple key-value store of interest topics and their
 * weights (how often/strongly the user has mentioned them).
 */

export interface InterestProfile {
  /** Map of topic -> weight (0-10) */
  interests: Record<string, number>;
  /** Map of topic -> list of user statements about it */
  memories: Record<string, string[]>;
  /** User's preferred name as spoken during sessions */
  preferredName: string | null;
  /** Number of sessions completed */
  sessionCount: number;
  /** Favourite character id chosen by user */
  preferredCompanionId: string | null;
  /** Running list of the last 20 exchanges for continuity */
  recentExchanges: { role: "user" | "companion"; text: string }[];
}

const STORAGE_KEY = "companion_interests_v1";

export function loadInterests(): InterestProfile {
  if (typeof window === "undefined")
    return { interests: {}, memories: {}, preferredName: null, sessionCount: 0, preferredCompanionId: null, recentExchanges: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as InterestProfile;
  } catch {
    /* ignore */
  }
  return { interests: {}, memories: {}, preferredName: null, sessionCount: 0, preferredCompanionId: null, recentExchanges: [] };
}

export function saveInterests(profile: InterestProfile) {
  if (typeof window === "undefined") return;
  // Keep recentExchanges to last 20
  profile.recentExchanges = profile.recentExchanges.slice(-20);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

/** Bumps the weight for a topic by `amount` (capped at 10). */
export function boostInterest(profile: InterestProfile, topic: string, amount = 1) {
  const t = topic.toLowerCase().trim();
  profile.interests[t] = Math.min(10, (profile.interests[t] ?? 0) + amount);
}

/** Returns the top N interests sorted by weight. */
export function topInterests(profile: InterestProfile, n = 5): string[] {
  return Object.entries(profile.interests)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k);
}
