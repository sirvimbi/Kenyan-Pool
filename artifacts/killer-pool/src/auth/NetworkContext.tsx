import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  ref, onValue, set, push, runTransaction, update, off, serverTimestamp,
  remove, onDisconnect, DataSnapshot
} from 'firebase/database';
import { getRtdb, isFirebaseConfigured } from '../firebase/config';
import { HUDState, BallState, Vec2 } from '@workspace/game-core';
import { useAuth } from './AuthContext';

interface NetworkContextType {
  roomId: string | null;
  gameState: HUDState | null;
  balls: BallState[] | null;
  activeAim: { aimAngle: number; power: number; spin: Vec2 & { pos?: Vec2 } } | null;
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

type RoomSnapshot = {
  state: HUDState;
  balls: BallState[];
  seq: number;
  hostUid: string;
  updatedAt?: number;
};

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<HUDState | null>(null);
  const [balls, setBalls] = useState<BallState[] | null>(null);
  const [activeAim, setActiveAim] = useState<RoomSnapshot['state'] extends HUDState ? { aimAngle: number; power: number; spin: Vec2 & { pos?: Vec2 } } | null : never>(null);
  const [rematchVotes, setRematchVotes] = useState<Record<string, boolean>>({});
  const [isHost, setIsHost] = useState(false);
  const [connected, setConnected] = useState(false);

  const lastOpponentUidRef = useRef<string | null>(null);
  const hostHeartbeatRef = useRef<number>(0);
  const hostUidRef = useRef<string | null>(null);
  const latestStateRef = useRef<HUDState | null>(null);
  const currentPresenceRef = useRef<any>(null);
  const isHostRef = useRef(isHost);
  const roomIdRef = useRef(roomId);
  const snapshotSeqRef = useRef(0);
  const currentPlayerUid = gameState?.players?.[gameState.currentPlayerIndex]?.uid || null;

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const connectedRef = ref(getRtdb(), '.info/connected');
    const unsub = onValue(connectedRef, snap => setConnected(!!snap.val()));
    return () => off(connectedRef, 'value', unsub);
  }, []);

  useEffect(() => {
    if (!roomId || !user?.uid || !isFirebaseConfigured) return;
    const presenceRef = ref(getRtdb(), `rooms/${roomId}/presence/${user.uid}`);
    const publish = () => {
      if (connected) update(presenceRef, { online: true, heartbeatAt: serverTimestamp() }).catch(() => {});
    };
    onDisconnect(presenceRef).update({ online: false, heartbeatAt: serverTimestamp() }).catch(() => {});
    publish();
    const interval = setInterval(publish, PLAYER_HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      update(presenceRef, { online: false, heartbeatAt: serverTimestamp() }).catch(() => {});
    };
  }, [roomId, user?.uid, connected]);

  const playVsAI = useCallback(async (stake: number, name: string, uid: string, previousScores?: Record<string, number>) => {
    const aiRoomId = `ai_${uid}_${Date.now()}`;
    const db = getRtdb();
    const participants = [{ uid, name, isAI: false }, { uid: 'bot', name: 'Bot', isAI: true }];
    const players = participants.map((p, i) => ({
      id: i, name: p.name, score: 0, fouls: 0, pots: 0, isAI: p.isAI,
      uid: p.uid, isBenched: false, balance: 10000
    }));
    const initialState: HUDState = {
      players, currentPlayerIndex: 0, targetBall: 3, timeLeft: 60, power: 0, phase: 'aiming',
      prizePool: Math.floor(stake * 2 * 0.9), shotResult: null, stake, camMode: 'table-fit',
      battleMode: false, spin: { x: 0, z: 0 }, aimAngle: 0
    };
    await set(ref(db, `rooms/${aiRoomId}`), {
      state: initialState, stake, participants, previousScores: previousScores || null,
      hostUid: uid, hostHeartbeatAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    setRoomId(aiRoomId);
    hostUidRef.current = uid;
    setIsHost(true);
  }, []);

  const joinQueue = useCallback(async (stake: number, name: string, uid: string, priorityUid?: string | null): Promise<() => void> => {
    if (!isFirebaseConfigured) return () => {};
    const db = getRtdb();
    const waitingSlotRef = ref(db, `matchmaking/${stake}/waitingSlot`);
    let localMatched = false;

    const unsubSlot = onValue(waitingSlotRef, async snap => {
      if (localMatched) return;
      const slot = snap.val();
      if (!slot || slot.status !== 'matched' || (slot.hostUid !== uid && slot.guestUid !== uid)) return;
      const isMeHost = slot.hostUid === uid;
      lastOpponentUidRef.current = isMeHost ? slot.guestUid : slot.hostUid;
      localMatched = true;
      hostUidRef.current = isMeHost ? uid : slot.hostUid;
      setIsHost(isMeHost);
      setRoomId(slot.matchId);
      if (isMeHost) {
        await update(ref(db, `rooms/${slot.matchId}`), {
          id: slot.matchId,
          stake,
          hostUid: uid,
          hostHeartbeatAt: serverTimestamp(),
          participants: [
            { uid: slot.hostUid, name: slot.hostName },
            { uid: slot.guestUid, name: slot.guestName }
          ],
          createdAt: serverTimestamp(),
          status: 'active'
        }).catch(() => {});
      }
      if (slot.guestUid === uid) {
        setTimeout(() => runTransaction(waitingSlotRef, current => {
          if (current && current.matchId === slot.matchId) return null;
          return undefined;
        }).catch(() => {}), 3000);
      }
    });

    const attemptMatch = async () => {
      if (localMatched) return;
      try {
        await runTransaction(waitingSlotRef, current => {
          if (!current) {
            return { hostUid: uid, hostName: name, status: 'waiting', timestamp: Date.now(), preferredGuestUid: priorityUid || null };
          }
          if (current.status === 'waiting') {
            const preferred = current.preferredGuestUid === uid;
            const stale = Date.now() - current.timestamp > 15000;
            if (current.hostUid !== uid && (!current.preferredGuestUid || preferred || stale)) {
              const matchId = `room_${stake}_${Date.now()}_${uid.slice(0, 4)}`;
              return { ...current, guestUid: uid, guestName: name, matchId, status: 'matched' };
            }
            if (current.hostUid === uid) return { ...current, timestamp: Date.now() };
          }
          if (current.status === 'waiting' && Date.now() - current.timestamp > 30000) {
            return { hostUid: uid, hostName: name, status: 'waiting', timestamp: Date.now(), preferredGuestUid: priorityUid || null };
          }
          return undefined;
        });
      } catch (err: any) {
        if (!String(err).includes('permission_denied')) console.error('Matchmaking Transaction Error:', err);
      }
    };

    attemptMatch();
    const interval = setInterval(() => { if (!localMatched) attemptMatch(); }, 4000);
    return () => {
      unsubSlot();
      clearInterval(interval);
      runTransaction(waitingSlotRef, current => current?.hostUid === uid && current.status === 'waiting' ? null : undefined).catch(() => {});
    };
  }, []);

  // One authoritative snapshot contains state AND balls. Firebase can deliver
  // two independent listeners in either order; that was the source of clients
  // occasionally combining a new state with an old ball array.
  useEffect(() => {
    if (!roomId || !isFirebaseConfigured) return;
    const db = getRtdb();
    const snapshotRef = ref(db, `rooms/${roomId}/snapshot`);
    const aimRef = ref(db, `rooms/${roomId}/activeAim`);
    const rematchRef = ref(db, `rooms/${roomId}/rematchVotes`);
    const hostRef = ref(db, `rooms/${roomId}/hostUid`);
    const heartbeatRef = ref(db, `rooms/${roomId}/hostHeartbeatAt`);

    const onSnapshot = onValue(snapshotRef, snap => {
      const value = snap.val() as RoomSnapshot | null;
      if (!value?.state || !Array.isArray(value.balls)) return;
      if (typeof value.seq === 'number' && value.seq < snapshotSeqRef.current) return;
      snapshotSeqRef.current = Number(value.seq || 0);
      const state = value.state as HUDState;
      state.players = (state.players || []).map((p: any) => ({
        ...p, score: p.score || 0, balance: p.balance || 0, name: p.name || 'Unknown', uid: p.uid || ''
      }));
      latestStateRef.current = state;
      setGameState(state);
      setBalls(value.balls);
    });
    const onAim = onValue(aimRef, snap => setActiveAim(snap.val() || null));
    const onRematch = onValue(rematchRef, snap => setRematchVotes(snap.val() || {}));
    const onHost = onValue(hostRef, snap => { hostUidRef.current = snap.val() || null; });
    const onHeartbeat = onValue(heartbeatRef, snap => {
      const value = snap.val();
      if (typeof value === 'number') hostHeartbeatRef.current = value;
    });

    return () => {
      off(snapshotRef, 'value', onSnapshot);
      off(aimRef, 'value', onAim);
      off(rematchRef, 'value', onRematch);
      off(hostRef, 'value', onHost);
      off(heartbeatRef, 'value', onHeartbeat);
    };
  }, [roomId]);

  useEffect(() => {
    snapshotSeqRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !currentPlayerUid || !isFirebaseConfigured) {
      currentPresenceRef.current = null;
      return;
    }
    const presenceRef = ref(getRtdb(), `rooms/${roomId}/presence/${currentPlayerUid}`);
    const unsub = onValue(presenceRef, snap => { currentPresenceRef.current = snap.val(); });
    return () => off(presenceRef, 'value', unsub);
  }, [roomId, currentPlayerUid]);

  // Host heartbeat and deterministic authority takeover. The new host does
  // not restart the rack; it continues from the latest authoritative snapshot.
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
      const hostUid = hostUidRef.current;
      if (!hostUid || !last || Date.now() - last < HOST_TIMEOUT_MS) return;
      try {
        const result = await runTransaction(ref(db, `rooms/${id}/hostUid`), current => {
          if (current !== hostUid) return undefined;
          return Date.now() - last >= HOST_TIMEOUT_MS ? user.uid : undefined;
        });
        if (result.committed && result.snapshot.val() === user.uid) {
          setIsHost(true);
          isHostRef.current = true;
          hostUidRef.current = user.uid;
          hostHeartbeatRef.current = Date.now();
          await update(roomRef, { hostUid: user.uid, hostHeartbeatAt: serverTimestamp() }).catch(() => {});
        }
      } catch (err) {
        console.warn('Network: authority takeover failed', err);
      }
    }, HOST_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [roomId, user?.uid, connected]);

  // Only the authority can apply an offline player's timeout. A new authority
  // therefore keeps the room playable when the previous authority disappears.
  useEffect(() => {
    if (!roomId || !isHost || !connected || !isFirebaseConfigured) return;
    const db = getRtdb();
    const interval = setInterval(async () => {
      const state = latestStateRef.current;
      if (!state || state.phase === 'roundEnd' || !state.players?.length) return;
      const current = state.players[state.currentPlayerIndex];
      if (!current?.uid || current.isAI || current.uid === user?.uid) return;
      const presence = currentPresenceRef.current;
      const heartbeat = presence?.heartbeatAt;
      if (presence?.online !== false && !(typeof heartbeat === 'number' && Date.now() - heartbeat > PLAYER_TIMEOUT_MS)) return;
      await runTransaction(ref(db, `rooms/${roomId}/state`), currentState => {
        if (!currentState || currentState.phase === 'roundEnd' || currentState.currentPlayerIndex !== state.currentPlayerIndex) return undefined;
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

  const updateAuthoritativeState = useCallback((state: HUDState, nextBalls: BallState[]) => {
    if (!roomId || !user?.uid || !isHostRef.current) return;
    const db = getRtdb();
    const seq = ++snapshotSeqRef.current;
    const snapshot: RoomSnapshot = {
      state,
      balls: nextBalls || [],
      seq,
      hostUid: user.uid,
      updatedAt: Date.now()
    };
    update(ref(db, `rooms/${roomId}`), {
      state,
      balls: nextBalls || [],
      snapshot,
      hostUid: user.uid,
      hostHeartbeatAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).catch(err => console.warn('Network: authoritative snapshot failed', err));
  }, [roomId, user?.uid]);

  const sendMove = useCallback((aimAngle: number, power: number, spin: Vec2 & { pos?: Vec2 }) => {
    if (!roomId || !user?.uid) return;
    const intentRef = push(ref(getRtdb(), `rooms/${roomId}/intents`));
    set(intentRef, {
      uid: user.uid,
      aimAngle,
      power,
      spin,
      createdAt: serverTimestamp()
    }).catch(() => {});
  }, [roomId, user?.uid]);

  const sendAimState = useCallback((aimAngle: number, power: number, spin: Vec2, pos?: Vec2) => {
    if (!roomId || !user?.uid) return;
    update(ref(getRtdb(), `rooms/${roomId}/activeAim`), {
      uid: user.uid,
      aimAngle,
      power,
      spin: { ...spin, pos: pos || null },
      updatedAt: serverTimestamp()
    }).catch(() => {});
  }, [roomId, user?.uid]);

  const voteRematch = useCallback((uid: string) => {
    if (!roomId) return;
    set(ref(getRtdb(), `rooms/${roomId}/rematchVotes/${uid}`), true).catch(() => {});
  }, [roomId]);

  const resetRoom = useCallback((players: any[], stake: number, previousScores?: Record<string, number>) => {
    if (!roomId || !user?.uid) return;
    const participants = players.map(p => ({ uid: p.uid, name: p.name, isAI: !!p.isAI }));
    update(ref(getRtdb(), `rooms/${roomId}`), {
      status: 'active',
      stake,
      participants,
      previousScores: previousScores || null,
      rematchVotes: null,
      snapshot: null,
      state: null,
      balls: null,
      activeAim: null,
      updatedAt: serverTimestamp(),
      hostUid: user.uid,
      hostHeartbeatAt: serverTimestamp()
    }).catch(() => {});
  }, [roomId, user?.uid]);

  const leaveRoom = useCallback(() => {
    const id = roomIdRef.current;
    const uid = user?.uid;
    if (!id || !uid || !isFirebaseConfigured) {
      setRoomId(null);
      setIsHost(false);
      return;
    }
    const db = getRtdb();
    if (isHostRef.current) {
      remove(ref(db, `rooms/${id}`)).catch(() => {});
    } else {
      update(ref(db, `rooms/${id}/presence/${uid}`), { online: false, heartbeatAt: serverTimestamp() }).catch(() => {});
    }
    setRoomId(null);
    setIsHost(false);
    isHostRef.current = false;
    latestStateRef.current = null;
    setGameState(null);
    setBalls(null);
    setActiveAim(null);
    setRematchVotes({});
  }, [user?.uid]);

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

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used within NetworkProvider');
  return context;
}