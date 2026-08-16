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
  onDisconnect,
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
  sendMove: (aimAngle: number, power: number, spin: Vec2 & { pos?: Vec2 }) => void;
  sendAimState: (aimAngle: number, power: number, spin: Vec2, pos?: Vec2) => void;
  voteRematch: (uid: string) => void;
  resetRoom: (players: any[], stake: number, previousScores?: Record<string, number>) => void;
  leaveRoom: () => void;
}

const NetworkContext = createContext<NetworkContextType | null>(null);
const HOST_HEARTBEAT_MS = 1000;
const HOST_TIMEOUT_MS = 4500;
const PLAYER_HEARTBEAT_MS = 2000;
const PLAYER_TIMEOUT_MS = 7000;

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
  const hostHeartbeatRef = useRef<number>(0);
  const roomDataRef = useRef<any>(null);
  const isHostRef = useRef(isHost);
  const roomIdRef = useRef(roomId);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const db = getRtdb();
    const connectedRef = ref(db, ".info/connected");
    const unsub = onValue(connectedRef, (snap) => setConnected(!!snap.val()));
    return () => off(connectedRef);
  }, []);

  // Keep every active client presence alive independently of the host.
  // This lets the current authority apply a timeout when a player locks
  // their device or loses connectivity without freezing the whole room.
  useEffect(() => {
    if (!roomId || !user?.uid || !isFirebaseConfigured) return;
    const db = getRtdb();
    const presenceRef = ref(db, `rooms/${roomId}/presence/${user.uid}`);
    let interval: ReturnType<typeof setInterval> | null = null;

    const publish = () => {
      if (!connected) return;
      update(presenceRef, { online: true, heartbeatAt: serverTimestamp() }).catch(() => {});
    };

    publish();
    interval = setInterval(publish, PLAYER_HEARTBEAT_MS);
    onDisconnect(presenceRef).update({ online: false, heartbeatAt: serverTimestamp() }).catch(() => {});

    return () => {
      if (interval) clearInterval(interval);
      update(presenceRef, { online: false, heartbeatAt: serverTimestamp() }).catch(() => {});
    };
  }, [roomId, user?.uid, connected]);

  const playVsAI = useCallback(async (stake: number, name: string, uid: string, previousScores?: Record<string, number>) => {
    const aiRoomId = `ai_${uid}_${Date.now()}`;
    const db = getRtdb();
    const participants = [
      { uid, name, isAI: false },
      { uid: 'bot', name: 'Bot', isAI: true }
    ];
    const players = participants.map((p, i) => ({
      id: i, name: p.name, score: 0, fouls: 0, pots: 0, isAI: p.isAI,
      uid: p.uid, isBenched: false, balance: 10000
    }));

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
      hostHeartbeatAt: serverTimestamp(),
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
      if (slot && slot.status === 'matched' && (slot.hostUid === uid || slot.guestUid === uid)) {
        const isMeHost = slot.hostUid === uid;
        if (isMeHost) lastOpponentUidRef.current = slot.guestUid;
        else lastOpponentUidRef.current = slot.hostUid;
        localMatched = true;
        setIsHost(isMeHost);
        setRoomId(slot.matchId);

        if (isMeHost) {
          const roomRef = ref(db, `rooms/${slot.matchId}`);
          const participants = [
            { uid: slot.hostUid, name: slot.hostName },
            { uid: slot.guestUid, name: slot.guestName }
          ];
          await update(roomRef, {
            id: slot.matchId,
            stake,
            hostUid: uid,
            hostHeartbeatAt: serverTimestamp(),
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
    });

    const attemptMatch = async () => {
      if (localMatched) return;
      try {
        await runTransaction(waitingSlotRef, (current) => {
          if (!current) return { hostUid: uid, hostName: name, status: 'waiting', timestamp: Date.now(), preferredGuestUid: priorityUid || null };
          if (current.status === 'waiting') {
            const isPreferredGuest = current.preferredGuestUid === uid;
            const isStale = Date.now() - current.timestamp > 15000;
            const canMatch = !current.preferredGuestUid || isPreferredGuest || isStale;
            if (current.hostUid !== uid && canMatch) {
              const matchId = `room_${stake}_${Date.now()}_${uid.slice(0, 4)}`;
              return { ...current, guestUid: uid, guestName: name, matchId, status: 'matched' };
            }
            if (current.hostUid === uid) return { ...current, timestamp: Date.now() };
          }
          if (current.status === 'waiting' && (Date.now() - current.timestamp > 30000)) {
            return { hostUid: uid, hostName: name, status: 'waiting', timestamp: Date.now(), preferredGuestUid: priorityUid || null };
          }
          return undefined;
        });
      } catch (err: any) {
        if (!err.toString().includes('permission_denied')) console.error("Matchmaking Transaction Error:", err);
      }
    };

    attemptMatch();
    const interval = setInterval(() => { if (!localMatched) attemptMatch(); }, 4000);
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
      roomDataRef.current = data;
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
        hostHeartbeatRef.current = typeof data.hostHeartbeatAt === 'number'
          ? data.hostHeartbeatAt
          : (typeof data.updatedAt === 'number' ? data.updatedAt : hostHeartbeatRef.current);
        setGameState(state);
        setBalls(data.balls || null);
        setActiveAim(data.activeAim || null);
        setRematchVotes(data.rematchVotes || {});
      } else {
        setGameState(null);
        setBalls(null);
        setActiveAim(null);
      }
    });
    return () => off(roomRef);
  }, [roomId]);

  // Host heartbeat + automatic authority takeover. The takeover is a Firebase
  // transaction, so two clients cannot simultaneously become the authority.
  useEffect(() => {
    if (!roomId || !user?.uid || !isFirebaseConfigured) return;
    const db = getRtdb();
    const interval = setInterval(async () => {
      const id = roomIdRef.current;
      if (!id || !connected) return;
      const roomRef = ref(db, `rooms/${id}`);

      if (isHostRef.current) {
        hostHeartbeatRef.current = Date.now();
        await update(roomRef, { hostUid: user.uid, hostHeartbeatAt: serverTimestamp() }).catch(() => {});
        return;
      }

      const last = hostHeartbeatRef.current;
      if (!last || Date.now() - last < HOST_TIMEOUT_MS) return;

      const claimRef = ref(db, `rooms/${id}/hostUid`);
      try {
        const result = await runTransaction(claimRef, (current) => {
          if (current !== roomDataRef.current?.hostUid) return undefined;
          const hb = roomDataRef.current?.hostHeartbeatAt;
          if (typeof hb === 'number' && Date.now() - hb >= HOST_TIMEOUT_MS) return user.uid;
          return undefined;
        });
        if (result.committed && result.snapshot.val() === user.uid) {
          console.warn('Network: Host heartbeat expired; promoting this client to authority.');
          setIsHost(true);
          hostHeartbeatRef.current = Date.now();
          await update(roomRef, { hostUid: user.uid, hostHeartbeatAt: serverTimestamp() }).catch(() => {});
        }
      } catch (err) {
        console.warn('Network: Authority takeover failed', err);
      }
    }, HOST_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [roomId, user?.uid, connected]);

  // If the current player disappears while aiming/powering, the active authority
  // applies a foul/timeout and advances the turn. This prevents one locked screen
  // from blocking everyone else.
  useEffect(() => {
    if (!roomId || !isHost || !connected || !isFirebaseConfigured) return;
    const db = getRtdb();
    const interval = setInterval(async () => {
      const data = roomDataRef.current;
      const state: HUDState | null = data?.state || null;
      if (!state || state.phase === 'roundEnd' || !state.players?.length) return;
      const current = state.players[state.currentPlayerIndex];
      if (!current?.uid || current.isAI || current.uid === user?.uid) return;
      const presence = data?.presence?.[current.uid];
      const heartbeat = presence?.heartbeatAt;
      const offline = presence?.online === false;
      const stale = typeof heartbeat === 'number' && Date.now() - heartbeat > PLAYER_TIMEOUT_MS;
      if (!offline && !stale) return;

      const stateRef = ref(db, `rooms/${roomId}/state`);
      await runTransaction(stateRef, (currentState: HUDState | null) => {
        if (!currentState || currentState.phase === 'roundEnd') return undefined;
        if (currentState.currentPlayerIndex !== state.currentPlayerIndex) return undefined;
        const players = currentState.players.map((p: any) => ({ ...p }));
        const idx = currentState.currentPlayerIndex;
        players[idx].fouls = (players[idx].fouls || 0) + 1;
        let next = (idx + 1) % players.length;
        let tries = 0;
        while (players[next]?.isBenched && tries < players.length) { next = (next + 1) % players.length; tries++; }
        return {
          ...currentState,
          players,
          currentPlayerIndex: next,
          phase: 'aiming',
          timeLeft: 60,
          power: 0,
          aimAngle: 0,
          spin: { x: 0, z: 0 },
          shotResult: { type: 'foul_wrong', pottedBalls: [], scoreChange: 0, message: `⚠ ${players[idx].name} timed out/offline — turn forfeited`, extraTurn: false } as any
        };
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [roomId, isHost, connected, user?.uid]);

  const updateAuthoritativeState = useCallback((state: HUDState, balls: BallState[]) => {
    if (!roomId) return;
    const db = getRtdb();
    update(ref(db, `rooms/${roomId}`), {
      state,
      balls: balls || [],
      hostUid: user?.uid || null,
      hostHeartbeatAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).catch(() => {});
  }, [roomId, user?.uid]);

  const sendMove = useCallback((aimAngle: number, power: number, spin: Vec2 & { pos?: Vec2 }) => {
    if (!roomId) return;
    const db = getRtdb();
    const intentRef = push(ref(db, `rooms/${roomId}/intents`));
    set(intentRef, { aimAngle, power, spin, createdAt: serverTimestamp(), uid: user?.uid }).catch(() => {});
  }, [roomId, user]);

  const sendAimState = useCallback((aimAngle: number, power: number, spin: Vec2, pos?: Vec2) => {
    if (!roomId) return;
    const db = getRtdb();
    update(ref(db, `rooms/${roomId}/activeAim`), {
      aimAngle, power, spin, pos: pos || null, updatedAt: serverTimestamp(), uid: user?.uid
    }).catch(() => {});
  }, [roomId, user]);

  const voteRematch = useCallback((uid: string) => {
    if (!roomId) return;
    update(ref(getRtdb(), `rooms/${roomId}/rematchVotes`), { [uid]: true }).catch(() => {});
  }, [roomId]);

  const resetRoom = useCallback((players: any[], stake: number, previousScores?: Record<string, number>) => {
    if (!roomId || !isHost) return;
    const db = getRtdb();
    update(ref(db, `rooms/${roomId}`), {
      intents: null,
      activeAim: null,
      rematchVotes: null,
      previousScores: previousScores || null,
      stake,
      hostUid: user?.uid || null,
      hostHeartbeatAt: serverTimestamp()
    }).catch(err => console.error("Network: Failed to reset transient room state", err));
  }, [roomId, isHost, user?.uid]);

  const leaveRoom = useCallback(() => {
    if (roomId && isHost) {
      const db = getRtdb();
      const roomPath = `rooms/${roomId}`;
      setTimeout(() => remove(ref(db, roomPath)).catch(() => {}), 3000);
    }
    setRoomId(null);
    setGameState(null);
    setBalls(null);
    setActiveAim(null);
    setIsHost(false);
  }, [roomId, isHost]);

  return (
    <NetworkContext.Provider value={{
      roomId, gameState, balls, activeAim, rematchVotes, isHost, connected,
      joinQueue, playVsAI, updateAuthoritativeState, sendMove, sendAimState,
      voteRematch, resetRoom, leaveRoom
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