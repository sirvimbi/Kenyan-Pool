import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import { getDb } from "./config";
import { PlayerState } from "@workspace/game-core";

export interface GameLog {
  id?: string;
  timestamp: any;
  stake: number;
  prizePool: number;
  playerCount: number;
  isAI: boolean;
  participants: { uid: string; name: string; isAI: boolean }[];
  winners: { uid: string; name: string }[];
  roomId: string;
}

const GAME_LOGS = "game_logs";

export async function logFinishedGame(params: {
  roomId: string;
  stake: number;
  prizePool: number;
  players: PlayerState[];
  winners: PlayerState[];
}): Promise<void> {
  try {
    const db = getDb();
    const isAI = params.players.some(p => p.isAI);

    const log: Omit<GameLog, "id"> = {
      timestamp: serverTimestamp(),
      stake: params.stake,
      prizePool: params.prizePool,
      playerCount: params.players.length,
      isAI,
      roomId: params.roomId,
      participants: params.players.map(p => ({
        uid: p.uid || `player_${p.id}`,
        name: p.name || "Unknown",
        isAI: !!p.isAI
      })),
      winners: params.winners.map(p => ({
        uid: p.uid || `player_${p.id}`,
        name: p.name || "Unknown"
      }))
    };

    await addDoc(collection(db, GAME_LOGS), log);
    console.log("GameLog: Successfully logged game result for room", params.roomId);
  } catch (err) {
    console.error("GameLog: Failed to log game result", err);
  }
}

/**
 * Fetches game logs.
 * Includes a fallback to fetch without ordering if the index isn't ready.
 */
export async function fetchGameLogs() {
  const db = getDb();
  const logsRef = collection(db, GAME_LOGS);

  try {
    // Attempt with ordering (requires index)
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err: any) {
    console.warn("GameLog: Ordered fetch failed, falling back to unordered fetch. (Index may be missing)", err);

    // Fallback: Fetch without ordering (works without index)
    const qFallback = query(logsRef, limit(200));
    const snapFallback = await getDocs(qFallback);
    const data = snapFallback.docs.map(d => ({ id: d.id, ...d.data() }));

    // Manual sort in memory if timestamp exists
    return data.sort((a: any, b: any) => {
      const ta = a.timestamp?.seconds || 0;
      const tb = b.timestamp?.seconds || 0;
      return tb - ta;
    });
  }
}
