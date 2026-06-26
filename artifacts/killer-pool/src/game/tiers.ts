import type { ProfileStats } from "../firebase/profile";

// Tiers are derived from lifetime wins. They are kept small and legible so a
// player can always see what the next rung needs. The ranking UI lives on the
// dashboard, never in-game.
export interface Tier {
  key: string;
  name: string;
  badge: string; // emoji badge
  minWins: number; // lifetime wins required to reach this tier
  color: string; // accent colour used in the UI
}

export const TIERS: Tier[] = [
  { key: "rookie", name: "Rookie", badge: "🎱", minWins: 0, color: "#9aa0b5" },
  { key: "hustler", name: "Hustler", badge: "🃏", minWins: 3, color: "#39d98a" },
  { key: "shark", name: "Shark", badge: "🦈", minWins: 10, color: "#39b8ff" },
  { key: "ace", name: "Ace", badge: "♠", minWins: 25, color: "#c07bff" },
  { key: "legend", name: "Legend", badge: "👑", minWins: 50, color: "#ffd400" },
];

export interface TierProgress {
  tier: Tier;
  next: Tier | null;
  // 0..1 progress toward the next tier (1 when already at the top tier).
  progress: number;
  winsIntoTier: number;
  winsForNext: number; // wins still needed to reach next tier (0 at top)
}

export function getTierProgress(stats: ProfileStats): TierProgress {
  const wins = stats?.wins ?? 0;
  // Highest tier whose threshold is met.
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (wins >= TIERS[i].minWins) idx = i;
  }
  const tier = TIERS[idx];
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;

  if (!next) {
    return {
      tier,
      next: null,
      progress: 1,
      winsIntoTier: wins - tier.minWins,
      winsForNext: 0,
    };
  }

  const span = next.minWins - tier.minWins;
  const into = wins - tier.minWins;
  return {
    tier,
    next,
    progress: Math.max(0, Math.min(1, into / span)),
    winsIntoTier: into,
    winsForNext: Math.max(0, next.minWins - wins),
  };
}

export function getTier(stats: ProfileStats): Tier {
  return getTierProgress(stats).tier;
}
