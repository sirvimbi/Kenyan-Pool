import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  ref,
  onValue,
  set,
  push,
  runTransaction,
  update,
  off,
  serverTimestamp,
  remove,
  get,
  DataSnapshot
} from "firebase/database";
import { getRtdb, isFirebaseConfigured } from "../firebase/config";
import { HUDState, BallState, Vec2 } from "@workspace/game-core";
import { useAuth } from "./AuthContext";

interface NetworkContextType {
  roomId: string | null;
  gameState: HUDState | null;
  balls: BallState[] | null;
  activeAim: { aimAngle: number, power: number, spin: Vec2, pos?: Vec2 } | null;
  rematchVotes: Record<string, boolean>;
  isHost: boolean;
  connected: boolean;
  joinQueue: (stake: number, name: string, uid: string, priorityUid?: string | null) => Promise<() => void>;
  playVsAI: (stake: number, name: string, uid: string, previousScores?: Record<string, number>) => void;
  updateAuthoritativeState: (state: HUDState, balls: BallState[]) => void;
  sendMove: (aimAngle: number, power: number, spin: Vec2) => void;
  sendAimState: (aimAngle: number, power: number, spin: Vec2, pos?: Vec2) => void;
  voteRematch: (uid: string) => void;
  resetRoom: (players: any[], stake: number, previousScores?: Record<string, number>) => void;
  leaveRoom: () => void;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<HUDState | null>(null);
  const [balls, setBalls] = useState<BallState[] | null>(null);
  const [activeAim, setActiveAim] = useState<{ aimAngle: number, power: number, spin: Vec2, pos?: Vec2 } | null>(null);
  const [rematchVotes, setRematchVotes] = useState<Record<string, boolean>>({});
  const [isHost, setIsHost] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const lastOpponentUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const db = getRtdb();
    const connectedRef = ref(db, ".info/connected");
    const unsub = onValue(connectedRef, (snap) => setConnected(!!snap.val()));
    return () => off(connectedRef);
  }, []);

  const playVsAI = useCallback(async (stake: number, name: string, uid: string, previousScores?: Record<string, number>) => {
    const aiRoomId = `ai_${uid}_${Date.now()}`;
    const db = getRtdb();

    const participants = [
      { uid, name, isAI: false },
      { uid: 'bot', name: 'Bot', isAI: true }
    ];

    // Pre-calculate initial state to ensure the UI has players to display immediately
    const players = participants.map((p, i) => ({
      id: i,
      name: p.name,
      score: 0,
      fouls: 0,
      pots: 0,
      isAI: p.isAI,
      uid: p.uid,
      isBenched: false,
      balance: 10000
    }));

    if (previousScores) {
      players.sort((a, b) => (previousScores[a.uid!] || 0) - (previousScores[b.uid!] || 0));
    }

    const initialState: HUDState = {
      players,
      currentPlayerIndex: 0,
      targetBall: 3,
      timeLeft: 60,
      power: 0,
      phase: 'aiming',
      prizePool: Math.floor(stake * 2 * 0.9),
      shotResult: null,
      stake,
      camMode: 'table-fit',
      battleMode: false,
      spin: { x: 0, z: 0 },
      aimAngle: 0
    };

    await set(ref(db, `rooms/${aiRoomId}`), {
      state: initialState,
      stake,
      participants,
      previousScores: previousScores || null,
      hostUid: uid,
      updatedAt: serverTimestamp()
    });

    setRoomId(aiRoomId);
    setIsHost(true);
  }, []);

  const joinQueue = useCallback(async (stake: number, name: string, uid: string, priorityUid?: string | null): Promise<() => void> => {
    if (!isFirebaseConfigured) return () => {};
    const db = getRtdb();
    const waitingSlotRef = ref(db, `matchmaking/${stake}/waitingSlot`);
    let localMatched = false;

    const unsubSlot = onValue(waitingSlotRef, async (snap: DataSnapshot) => {
      if (localMatched) return;
      const slot = snap.val();

      if (slot && slot.status === 'matched') {
        if (slot.hostUid === uid || slot.guestUid === uid) {
          const isMeHost = slot.hostUid === uid;
          console.log("Network: Match found!", slot.matchId, isMeHost ? "(Host)" : "(Guest)");

          if (isMeHost) {
            lastOpponentUidRef.current = slot.guestUid;
          } else {
            lastOpponentUidRef.current = slot.hostUid;
          }

          localMatched = true;
          setIsHost(isMeHost);
          setRoomId(slot.matchId);

          if (isMeHost) {
            const roomRef = ref(db, `rooms/${slot.matchId}`);
            const participants = [
              { uid: slot.hostUid, name: slot.hostName },
              { uid: slot.guestUid, name: slot.guestName }
            ];

            console.log("Network: Host initializing room...");
            await update(roomRef, {
              id: slot.matchId,
              stake,
              hostUid: uid,
              participants,
              createdAt: serverTimestamp(),
              status: 'active'
            });
          }

          if (slot.guestUid === uid) {
            setTimeout(() => {
              runTransaction(waitingSlotRef, (current) => {
                if (current && current.matchId === slot.matchId) return null;
                return undefined;
              });
            }, 3000);
          }
        }
      }
    });

    const attemptMatch = async () => {
      if (localMatched) return;
      try {
        await runTransaction(waitingSlotRef, (current) => {
          if (!current) {
            return { hostUid: uid, hostName: name, status: 'waiting', timestamp: Date.now(), preferredGuestUid: priorityUid || null };
          }

          // Match logic
          if (current.status === 'waiting') {
            // Priority Check: If I'm the preferred guest, OR if there's no preference, OR if current slot is stale
            const isPreferredGuest = current.preferredGuestUid === uid;
            const isStale = Date.now() - current.timestamp > 15000;
            const canMatch = !current.preferredGuestUid || isPreferredGuest || isStale;

            if (current.hostUid !== uid && canMatch) {
              const matchId = `room_${stake}_${Date.now()}_${uid.slice(0, 4)}`;
              return {
                ...current,
                guestUid: uid,
                guestName: name,
                matchId,
                status: 'matched'
              };
            }

            // If I am the same host, just refresh timestamp (keep waiting)
            if (current.hostUid === uid) {
              return { ...current, timestamp: Date.now() };
            }
          }

          // Fallback: If current is matched but not with me, and I've been waiting too long, I can't do anything here.
          // Or if current is stale 'waiting', take it over.
          if (current.status === 'waiting' && (Date.now() - current.timestamp > 30000)) {
             return { hostUid: uid, hostName: name, status: 'waiting', timestamp: Date.now(), preferredGuestUid: priorityUid || null };
          }

          return undefined;
        });
      } catch (err: any) {
        if (!err.toString().includes('permission_denied')) {
          console.error("Matchmaking Transaction Error:", err);
        }
      }
    };

    attemptMatch();
    const interval = setInterval(() => {
      if (!localMatched) attemptMatch();
    }, 4000);

    return () => {
      unsubSlot();
      clearInterval(interval);
      runTransaction(waitingSlotRef, (current) => {
        if (current && current.hostUid === uid && current.status === 'waiting') return null;
        return undefined;
      }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!roomId || !isFirebaseConfigured) return;
    const db = getRtdb();
    const roomRef = ref(db, `rooms/${roomId}`);

    const unsub = onValue(roomRef, (snapshot: DataSnapshot) => {
      const data = snapshot.val();
      if (data) {
        const state = data.state || null;
        if (state) {
          state.players = (state.players || []).map((p: any) => ({
            ...p,
            score: p.score || 0,
            balance: p.balance || 0,
            name: p.name || 'Unknown',
            uid: p.uid || ''
          }));
        }

        setGameState(state);
        setBalls(data.balls || null);
        setActiveAim(data.activeAim || null);
        setRematchVotes(data.rematchVotes || {});
      } else {
        // Room is truly gone
        setGameState(null);
      }
    });

    return () => off(roomRef);
  }, [roomId]);

  const updateAuthoritativeState = useCallback((state: HUDState, balls: BallState[]) => {
    if (!roomId) return;
    const db = getRtdb();
    // SYNC FIX: Explicitly send balls (empty array is fine) to ensure Guest gets initial rack
    const updates: any = {
      state,
      balls: balls || [],
      updatedAt: serverTimestamp()
    };
    update(ref(db, `rooms/${roomId}`), updates);
  }, [roomId]);

  const sendMove = useCallback((aimAngle: number, power: number, spin: Vec2) => {
    if (!roomId) return;
    const db = getRtdb();
    const intentRef = push(ref(db, `rooms/${roomId}/intents`));
    set(intentRef, {
      aimAngle,
      power,
      spin,
      createdAt: serverTimestamp(),
      uid: user?.uid
    });
  }, [roomId, user]);

  const sendAimState = useCallback((aimAngle: number, power: number, spin: Vec2, pos?: Vec2) => {
    if (!roomId) return;
    const db = getRtdb();
    update(ref(db, `rooms/${roomId}/activeAim`), {
      aimAngle,
      power,
      spin,
      pos: pos || null,
      updatedAt: serverTimestamp(),
      uid: user?.uid
    });
  }, [roomId, user]);

  const voteRematch = useCallback((uid: string) => {
    if (!roomId) return;
    const db = getRtdb();
    update(ref(db, `rooms/${roomId}/rematchVotes`), { [uid]: true });
  }, [roomId]);

  const resetRoom = useCallback((players: any[], stake: number, previousScores?: Record<string, number>) => {
    if (!roomId || !isHost) return;
    const db = getRtdb();

    // Clear old data and reset state
    remove(ref(db, `rooms/${roomId}/intents`));
    remove(ref(db, `rooms/${roomId}/activeAim`));
    remove(ref(db, `rooms/${roomId}/rematchVotes`));

    // Engine will call updateAuthoritativeState soon after Host calls startGame
  }, [roomId, isHost]);

  const leaveRoom = useCallback(() => {
    if (roomId && isHost) {
      const db = getRtdb();
      const roomPath = `rooms/${roomId}`;

      // Delay deletion slightly to allow guests to see the final "game ended" state
      setTimeout(() => {
        remove(ref(db, roomPath)).catch(() => {});
      }, 3000);
    }
    setRoomId(null);
    setGameState(null);
    setBalls(null);
    setActiveAim(null);
    setIsHost(false);
  }, [roomId, isHost]);

  return (
    <NetworkContext.Provider value={{
      roomId,
      gameState,
      balls,
      activeAim,
      rematchVotes,
      isHost,
      connected,
      joinQueue,
      playVsAI,
      updateAuthoritativeState,
      sendMove,
      sendAimState,
      voteRematch,
      resetRoom,
      leaveRoom
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
};
