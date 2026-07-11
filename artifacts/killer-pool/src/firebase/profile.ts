import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  increment,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb, isFirebaseConfigured } from "./config";
import { STARTING_BALANCE } from "../game/types";

// ── Profile data model ────────────────────────────────────────
// The wallet is intentionally namespaced by currency so real money can be added
// later (e.g. `wallet.real`) without migrating existing play-money documents.
export interface Wallet {
  play: number; // play-money balance (KSh, play only)
  // real?: number;       // future: real-money balance in cents
  // currency?: string;   // future: ISO currency for real money
}

export interface ProfileStats {
  gamesPlayed: number;
  wins: number;
  biggestPot: number;
}

export interface PlayerProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  wallet: Wallet;
  stats: ProfileStats;
  createdAt?: unknown; // Firestore Timestamp
  updatedAt?: unknown;
}

const PROFILES = "profiles";

function defaultDisplayName(user: User): string {
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email) return user.email.split("@")[0];
  return "Player";
}

// Fetch the profile, creating it on first sign-in with a starting grubstake.
export async function getOrCreateProfile(user: User): Promise<PlayerProfile> {
  if (!isFirebaseConfigured) {
    return {
      uid: user.uid,
      displayName: user.displayName || "Guest Player",
      email: user.email,
      photoURL: user.photoURL,
      wallet: { play: STARTING_BALANCE },
      stats: { gamesPlayed: 0, wins: 0, biggestPot: 0 },
    };
  }
  const db = getDb();
  const ref = doc(db, PROFILES, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as PlayerProfile;
  }

  const profile: PlayerProfile = {
    uid: user.uid,
    displayName: defaultDisplayName(user),
    email: user.email,
    photoURL: user.photoURL,
    wallet: { play: STARTING_BALANCE },
    stats: { gamesPlayed: 0, wins: 0, biggestPot: 0 },
  };

  await setDoc(ref, {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return profile;
}

// Live subscription to the signed-in player's own profile.
export function subscribeProfile(
  uid: string,
  cb: (profile: PlayerProfile | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!isFirebaseConfigured) {
    // In demo mode, no live updates from Firestore.
    return () => {};
  }
  const db = getDb();
  const ref = doc(db, PROFILES, uid);
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? (snap.data() as PlayerProfile) : null),
    (err) => {
      console.error("Firestore subscription error:", err);
      if (onError) onError(err);
      else cb(null);
    },
  );
}

export interface GameResult {
  // The local player's new play-money balance after the game settled.
  newBalance: number;
  won: boolean;
  // Amount won this game (perWinner payout), used to track the biggest pot.
  potWon: number;
}

// Persist the outcome of a finished game to the signed-in player's profile.
export async function recordGameResult(
  uid: string,
  result: { won: boolean; potWon: number },
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  const ref = doc(db, PROFILES, uid);

  await updateDoc(ref, {
    "wallet.play": increment(result.won ? result.potWon : 0),
    "stats.gamesPlayed": increment(1),
    ...(result.won ? { "stats.wins": increment(1) } : {}),
    "stats.biggestPot": await maxBiggestPot(uid, result.potWon),
    updatedAt: serverTimestamp(),
  });
}

export async function deductStake(uid: string, stake: number): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  const ref = doc(db, PROFILES, uid);
  await updateDoc(ref, {
    "wallet.play": increment(-stake),
    updatedAt: serverTimestamp(),
  });
}

export async function addCredits(uid: string, amount: number): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  const ref = doc(db, PROFILES, uid);
  await updateDoc(ref, {
    "wallet.play": increment(amount),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProfile(
  uid: string,
  data: Partial<PlayerProfile>,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  const ref = doc(db, PROFILES, uid);
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// Firestore has no atomic max(); read-then-write keeps the largest pot seen.
async function maxBiggestPot(uid: string, potWon: number): Promise<number> {
  const db = getDb();
  const ref = doc(db, PROFILES, uid);
  const snap = await getDoc(ref);
  const current = snap.exists()
    ? ((snap.data() as PlayerProfile).stats?.biggestPot ?? 0)
    : 0;
  return Math.max(current, Math.round(potWon));
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  balance: number;
  wins: number;
  gamesPlayed: number;
}

// Top players ranked by current play-money balance.
export async function fetchLeaderboard(max = 10): Promise<LeaderboardEntry[]> {
  if (!isFirebaseConfigured) return [];
  const db = getDb();
  const q = query(
    collection(db, PROFILES),
    orderBy("wallet.play", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const p = d.data() as PlayerProfile;
    return {
      uid: p.uid,
      displayName: p.displayName,
      photoURL: p.photoURL ?? null,
      balance: p.wallet?.play ?? 0,
      wins: p.stats?.wins ?? 0,
      gamesPlayed: p.stats?.gamesPlayed ?? 0,
    };
  });
}
