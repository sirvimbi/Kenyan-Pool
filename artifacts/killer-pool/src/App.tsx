import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine } from "./game/engine";
import { HUDState, BALL_VALUES, BALL_COLORS, STARTING_BALANCE, PlayerState } from "@workspace/game-core";
import { useAuth } from "./auth/AuthContext";
import SignInScreen from "./screens/SignInScreen";
import Dashboard from "./screens/Dashboard";
import { recordGameResult, deductStake } from "./firebase/profile";
import { logFinishedGame } from "./firebase/game-logs";

import { getRtdb } from "./firebase/config";
import { ref, onValue, onChildAdded, off as offRtdb, update } from "firebase/database";
import { sendMessage, subscribeMessages, type ChatMessage } from "./firebase/chat";
import { VoiceManager } from "./firebase/voice";
import { Mic, MicOff, MessageSquare, Send, X, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useNetwork } from "./auth/NetworkContext";

// ── Main App Component ───────────────────────────────────────
type Screen = 'dashboard' | 'menu' | 'game' | 'roundEnd';

export default function App() {
  const { user, profile, loading } = useAuth();
  const {
    roomId: netRoomId,
    gameState: netGameState,
    balls: netBalls,
    activeAim: netActiveAim,
    rematchVotes: netRematchVotes,
    connected,
    isHost,
    joinQueue,
    playVsAI,
    sendMove,
    sendAimState,
    voteRematch,
    resetRoom,
    updateAuthoritativeState,
    leaveRoom
  } = useNetwork();

  const [screen, setScreen] = useState<Screen>('dashboard');
  const [hud, setHud] = useState<HUDState | null>(null);
  const [roundData, setRoundData] = useState<RoundEndData | null>(null);
  const [lastConfigs, setLastConfigs] = useState<{ mode: 'ai' | 'pvp'; stake: number } | null>(null);
  const [lastOpponentUid, setLastOpponentUid] = useState<string | null>(null);
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [engine, setEngine] = useState<GameEngine | null>(null);
  const engineInstanceRef = useRef<GameEngine | null>(null);
  const lastStartedRoomIdRef = useRef<string | null>(null);
  const lastStartedEngineRef = useRef<GameEngine | null>(null);
  const unsubMatchmakingRef = useRef<(() => void) | null>(null);
  const hasReceivedStateRef = useRef(false);

  // Prevent a stale roundEnd Firebase snapshot from resurrecting
  // the previous result screen while the host is committing a rematch.
  const rematchRestartingRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileBalanceRef = useRef<number>(STARTING_BALANCE);
  const lastHudSyncRef = useRef(0);
  const lastAimSyncRef = useRef(0);

  // ── Callbacks ──
  const handleMenu = useCallback(() => {
    if (netRoomId) { leaveRoom(); }
    if (unsubMatchmakingRef.current) { unsubMatchmakingRef.current(); unsubMatchmakingRef.current = null; }
    setScreen('dashboard');
    setIsSearching(false);
    setShowQuitDialog(false);
    setRoundData(null);
  }, [leaveRoom, netRoomId]);

  const handleQuitRequest = useCallback(() => setShowQuitDialog(true), []);
  const handleCancelSearch = useCallback(() => { if (unsubMatchmakingRef.current) { unsubMatchmakingRef.current(); unsubMatchmakingRef.current = null; } setIsSearching(false); }, []);

  const handleStart = useCallback((mode: 'ai' | 'pvp', stake: number, previousScores?: Record<string, number>, priorityUid?: string | null) => {
    setLastConfigs({ mode, stake });
    if (!user) return;
    setRoundData(null);
    if (mode === 'ai') {
      playVsAI(stake, profile?.displayName || "Player", user.uid, previousScores);
      setScreen('game');
    } else {
      joinQueue(stake, profile?.displayName || "Player", user.uid, priorityUid).then(cleanup => { unsubMatchmakingRef.current = cleanup; });
      setIsSearching(true);
    }
  }, [user, profile, joinQueue, playVsAI]);

  const handleReplay = useCallback(() => {
    if (!lastConfigs || !user) { setScreen('menu'); return; }

    if (lastConfigs.mode === 'pvp' && netRoomId) {
      // Signal intent to rematch in the current room
      voteRematch(user.uid);
    } else {
      handleStart(lastConfigs.mode, lastConfigs.stake);
    }
  }, [lastConfigs, handleStart, user, netRoomId, voteRematch]);

  const handleChangeStakes = useCallback(() => {
    // When changing stakes, we still want to prioritize the previous opponent if they also pick the same stake
    if (netRoomId) { leaveRoom(); }
    if (unsubMatchmakingRef.current) { unsubMatchmakingRef.current(); unsubMatchmakingRef.current = null; }
    setScreen('menu');
    setIsSearching(false);
    setShowQuitDialog(false);
    setRoundData(null);
  }, [leaveRoom, netRoomId]);

  // ── Sync refs for engine callbacks ──
  const isHostRef = useRef(isHost);
  const roomIdRef = useRef(netRoomId);
  const userUidRef = useRef(user?.uid);
  const screenRef = useRef(screen);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => {
    if (roomIdRef.current !== netRoomId) {
      hasReceivedStateRef.current = false;
    }
    roomIdRef.current = netRoomId;
  }, [netRoomId]);
  useEffect(() => { userUidRef.current = user?.uid; }, [user?.uid]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // ── Re-sync on Foreground ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && screenRef.current === 'game' && netRoomId) {
        console.log("App: Returning to foreground. Requesting hard sync...");
        // The netGameState listener will naturally trigger updates, but we force an engine check
        if (engine && netGameState) {
          engine.syncStateFromServer(netGameState);
          if (netBalls) engine.syncBallsFromServer(netBalls);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [engine, netGameState, netBalls, netRoomId]);

  // ── Room Dissolution Detection ──
  useEffect(() => {
    if (netGameState) {
      hasReceivedStateRef.current = true;
    }

    // If we are in the game screen but the room data is gone from the network, the game ended.
    // We ONLY trigger this if we once had a state (meaning the room was active) and now it's gone.
    // This prevents the initial race condition when joining as a Guest.
    if (screen === 'game' && !netGameState && !loading && netRoomId && hasReceivedStateRef.current) {
      console.warn("App: Room was dissolved while in game. Returning to dashboard.");
      handleMenu();
      alert("This game session has concluded or the host has left.");
    }
  }, [netGameState, screen, loading, netRoomId, handleMenu]);

  useEffect(() => {
    profileBalanceRef.current = profile?.wallet.play ?? STARTING_BALANCE;
    if (engine && user) {
      engine.setLocalUid(user.uid);
      // Ensure engine knows if it's our turn based on fresh UID
      const hudState = engine.getHUDState();
      setHud(hudState);

      // If we are Host, ensure the room is broadcasted at least once with balls
      if (isHost && netRoomId) {
         updateAuthoritativeState(hudState, engine.balls);
      }
    }
  }, [profile, user, engine, isHost, netRoomId, updateAuthoritativeState]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 600 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ── Engine Initialization ──
  useEffect(() => {
    if (screen !== 'game' || !canvasRef.current || engineInstanceRef.current) return;

    console.log("App: Initializing GameEngine singleton...");
    const canvas = canvasRef.current;
    const eng = new GameEngine();
    eng.init(canvas, user?.uid || null);
    engineInstanceRef.current = eng;

    // Explicitly sync engine authority with React state
    eng.setAuthoritative(isHost);

    eng.on('hud', (data) => {
      const state = data as HUDState;
      const currentRoomId = roomIdRef.current;
      const isAIRoom = !!currentRoomId?.startsWith('ai_');
      const curPlayer = state.players[state.currentPlayerIndex];
      const isMyTurn = curPlayer && curPlayer.uid === userUidRef.current;

      // Always update local HUD if players are initialized so Guests can see the table
      if (state.players.length > 0) {
        setHud(state);

        // Only send active aim state to server if it's our turn
        if (isMyTurn && !isHostRef.current && !isAIRoom && state.phase === 'aiming') {
          const now = Date.now();
          if (now - lastAimSyncRef.current > 100) {
            const cueBall = eng.balls.find(b => b.number === 0);
            sendAimState(state.aimAngle, state.power, state.spin, cueBall?.pos);
            lastAimSyncRef.current = now;
          }
        }
      }
    });

    eng.on('shot:fired', (data: any) => {
      // data.spin may contain the final ball-in-hand position.
      // Preserve it in the authoritative shot intent.
      sendMove(data.aimAngle, data.power, data.spin);
    });

    setEngine(eng);

    return () => {
      console.log("App: Disposing GameEngine...");
      eng.dispose();
      engineInstanceRef.current = null;
      setEngine(null);
    };
  }, [screen]); // ONLY re-create on screen change. Props synced via other effects.

  useEffect(() => {
    if (engine) {
      engine.setAuthoritative(isHost);
    }
  }, [engine, isHost]);

  useEffect(() => {
    if (engine && user) {
      engine.setLocalUid(user.uid);
    }
  }, [engine, user?.uid]);

  // Handle screen transition when matched
  useEffect(() => {
    if (netRoomId && screen !== 'game' && screen !== 'roundEnd') {
      setScreen('game');

      // Cache opponent UID for priority matching later
      if (netGameState?.players) {
        const other = netGameState.players.find(p => p.uid !== user?.uid);
        if (other?.uid) setLastOpponentUid(other.uid);
      }

      if (isSearching && user && lastConfigs?.stake) {
        deductStake(user.uid, lastConfigs.stake).catch(console.error);
      }
      setIsSearching(false);
    }
  }, [netRoomId, screen, isSearching, user, lastConfigs, netGameState?.players]);

  // Handle game state from network
  useEffect(() => {
    if (!netGameState || !engine) return;

    const curPlayer = netGameState.players[netGameState.currentPlayerIndex];
    const isMyTurn = curPlayer && curPlayer.uid === user?.uid;

    if (!isHost) {
      if (!isMyTurn) {
        setHud(netGameState);
        engine.syncStateFromServer(netGameState);
      } else {
        setHud(prev => {
          if (!prev) return netGameState;
          // If we are in 'aiming' phase locally, we keep our local aiming state for smoothness.
          // BUT if the server has moved to another phase (e.g. evaluating), we MUST follow it.
          const keepLocalAim = prev.phase === 'aiming' && netGameState.phase === 'aiming';
          if (keepLocalAim) {
            return { ...netGameState, power: prev.power, spin: prev.spin, aimAngle: prev.aimAngle, phase: prev.phase };
          }
          return netGameState;
        });
        engine.syncStateFromServer(netGameState);
      }
    }

    if (netGameState.phase === 'roundEnd') {
      if (rematchRestartingRef.current) {
        return;
      }

      setScreen('roundEnd');
      if (!roundData) {
        const maxScore = Math.max(...netGameState.players.map(p => p.score));
        const winners = netGameState.players.filter(p => p.score === maxScore && maxScore > 0);
        const payout = {
          pool: netGameState.stake * netGameState.players.length,
          fee: Math.round(netGameState.stake * netGameState.players.length * 0.1),
          net: netGameState.prizePool,
          perWinner: winners.length > 0 ? Math.floor(netGameState.prizePool / winners.length) : 0
        };
        setRoundData({ players: netGameState.players, winners, payout });
        if (isHost && netRoomId) {
          // Log game metadata for admin
          logFinishedGame({
            roomId: netRoomId,
            stake: netGameState.stake,
            prizePool: netGameState.prizePool,
            players: netGameState.players,
            winners: winners
          });

          const db = getRtdb();
          const previousScores: Record<string, number> = {};
          netGameState.players.forEach(p => { if (p.uid) previousScores[p.uid] = p.score; });
          update(ref(db, `rooms/${netRoomId}`), { previousScores });
        }
      }
    }
  }, [netGameState, engine, isHost, user?.uid, netRoomId, roundData]);

  // Handle Rematch Logic
  useEffect(() => {
    if (
      screen !== 'roundEnd' ||
      !netRematchVotes ||
      !hud ||
      !engine ||
      !isHost
    ) {
      return;
    }

    if (rematchRestartingRef.current) {
      return;
    }

    // Use the actual players in the finished room, not the number
    // of arbitrary keys in rematchVotes.
    const players = netGameState?.players?.length
      ? netGameState.players
      : hud.players;

    const playerUids = players
      .map(p => p.uid)
      .filter((uid): uid is string => !!uid);

    const allPlayersVoted =
      playerUids.length > 0 &&
      playerUids.every(uid => netRematchVotes[uid] === true);

    if (!allPlayersVoted) {
      return;
    }

    console.log("Host: All actual players voted for rematch. Restarting...");

    // Lock the restart before changing Firebase state. This prevents
    // the old roundEnd snapshot from immediately restoring roundEnd UI.
    rematchRestartingRef.current = true;

    const previousScores: Record<string, number> = {};
    players.forEach(p => {
      if (p.uid) {
        previousScores[p.uid] = p.score;
      }
    });

    resetRoom(players, hud.stake, previousScores);

    // Re-use the same two matched players. This is deliberately NOT
    // matchmaking again and therefore preserves the existing PvP pair.
    engine.startGame(
      players,
      hud.stake,
      profileBalanceRef.current,
      previousScores,
      user?.uid
    );

    // Immediately publish the fresh authoritative aiming state.
    // Do not wait for the normal 400ms host heartbeat.
    const freshHud = engine.getHUDState();
    updateAuthoritativeState(freshHud, engine.balls);

    setHud(freshHud);
    setRoundData(null);
    setScreen('game');
  }, [
    netRematchVotes,
    netGameState,
    screen,
    hud,
    engine,
    isHost,
    resetRoom,
    updateAuthoritativeState,
    user?.uid
  ]);

  // Release the restart lock once Firebase has advanced beyond roundEnd.
  useEffect(() => {
    if (netGameState?.phase && netGameState.phase !== 'roundEnd') {
      rematchRestartingRef.current = false;
    }
  }, [netGameState?.phase]);

  // Guest: Watch for Host resetting the game phase
  useEffect(() => {
    if (screen === 'roundEnd' && netGameState?.phase === 'aiming' && !isHost) {
      console.log("Guest: Host restarted the game. Joining...");
      setRoundData(null);
      setScreen('game');
    }
  }, [netGameState?.phase, screen, isHost]);

  // Handle case where other player leaves during round end
  useEffect(() => {
    if (screen === 'roundEnd' && !netGameState && netRoomId && !isHost) {
      console.log("Guest: Room was dissolved by host.");
      if (lastConfigs) {
        console.log("Guest: Re-joining queue for same stake...");
        handleStart(lastConfigs.mode, lastConfigs.stake, undefined, lastOpponentUid);
      }
    }
  }, [netGameState, netRoomId, screen, isHost, lastConfigs, handleStart, lastOpponentUid]);

  // Sync balls/aim from network
  useEffect(() => {
    if (engine) {
      if (netBalls) {
        engine.syncBallsFromServer(netBalls);
      }
      if (netActiveAim) engine.syncAimFromServer(netActiveAim);
    }
  }, [netBalls, netActiveAim, engine]);

  // Start game when host
  useEffect(() => {
    if (!isHost || !netRoomId || !engine) {
       return;
    }
    if (lastStartedRoomIdRef.current === netRoomId && lastStartedEngineRef.current === engine) return;

    console.log("Host: Match Effect triggered for room", netRoomId);

    const db = getRtdb();
    const roomRef = ref(db, `rooms/${netRoomId}`);

    // Use onValue to handle potential metadata arrival delay (atomic read)
    let unsubscribed = false;
    let unsub: any;
    unsub = onValue(roomRef, (snap: any) => {
      if (unsubscribed) return;
      const data = snap.val();
      if (!data || !data.participants) {
        console.log("Host: Match metadata still pending...");
        return;
      }

      const players = data.participants.map((p: any) => ({
        name: p.name,
        isAI: !!p.isAI,
        uid: p.uid
      }));

      // AI Match Fix: Even if state exists (template from playVsAI), force startGame if balls are missing
      const isAIRoom = !!netRoomId?.startsWith('ai_');
      const needsStart = isAIRoom ? (!data.balls || data.balls.length === 0) : (!data.state || !data.state.players || data.state.players.length === 0);

      if (needsStart) {
        console.log("Host: Match confirmed. Starting a fresh session...");
        lastStartedRoomIdRef.current = netRoomId;
        lastStartedEngineRef.current = engine;
        engine.startGame(players, data.stake || 100, profileBalanceRef.current, data.previousScores, user?.uid);
      } else if (!isAIRoom) {
        // PvP Resume Logic: Only sync from server if NOT an AI room to avoid turn-skipping bugs
        console.log("Host: Match already initialized. Resuming current state...");
        lastStartedRoomIdRef.current = netRoomId;
        lastStartedEngineRef.current = engine;
        engine.setLocalUid(user?.uid || null);
        engine.syncStateFromServer(data.state);
        if (data.balls && data.balls.length > 0) engine.syncBallsFromServer(data.balls);
        engine.setAuthoritative(true);
      }

      unsubscribed = true;
      // Use microtask to ensure unsub is assigned before calling
      Promise.resolve().then(() => {
        if (typeof unsub === 'function') unsub();
      });
    });

    return () => {
      unsubscribed = true;
      if (typeof unsub === 'function') unsub();
    };
  }, [isHost, netRoomId, engine, user?.uid]);

  // Host broadcast
  const lastPhaseRef = useRef<string | null>(null);
  const lastHeartbeatRef = useRef(0);

  useEffect(() => {
    if (isHost && netRoomId && hud && engine) {
      const now = Date.now();
      const phaseChanged = lastPhaseRef.current !== hud.phase;
      const isHeartbeat = now - lastHeartbeatRef.current > 2000;

      // REAL-TIME FIX: Use aggressive 40ms sync during simulation
      // Aiming phase uses 400ms. Evaluating/RoundEnd are instant.
      const throttleMs = (hud.phase === 'simulating') ? 40
                       : (hud.phase === 'aiming') ? 400
                       : 0;

      if (!phaseChanged && !isHeartbeat && (now - lastHudSyncRef.current < throttleMs)) return;

      lastPhaseRef.current = hud.phase;
      lastHudSyncRef.current = now;
      if (isHeartbeat) lastHeartbeatRef.current = now;

      // Ensure we always broadcast balls if we have them
      const hasBalls = engine.balls && engine.balls.length > 0;
      updateAuthoritativeState({ ...hud }, hasBalls ? engine.balls : []);
    }
  }, [isHost, netRoomId, hud, engine, updateAuthoritativeState]);

  // Host: Listen for guest intents
  useEffect(() => {
    if (!isHost || !netRoomId || !engine) return;
    const db = getRtdb();
    const intentsRef = ref(db, `rooms/${netRoomId}/intents`);
    const processedKeys = new Set<string>();
    const unsub = onChildAdded(intentsRef, (snapshot) => {
      const key = snapshot.key;
      if (!key || processedKeys.has(key)) return;
      processedKeys.add(key);
      const move = snapshot.val();
      const now = Date.now();
      if (move && move.createdAt > (now - 10000)) {
        const hudState = engine.getHUDState();
        const curPlayer = hudState.players[hudState.currentPlayerIndex];
        if (curPlayer && curPlayer.uid !== user?.uid) {
          engine.remoteShot(move.aimAngle, move.power, move.spin);
        }
      }
    });
    return () => offRtdb(intentsRef, 'child_added', unsub);
  }, [isHost, netRoomId, engine, user?.uid]);

  useEffect(() => {
    if (!roundData || !user?.uid) return;
    const won = roundData.winners.some(w => w.id === 0);
    recordGameResult(user.uid, { won, potWon: won ? roundData.payout.perWinner : 0 }).catch(err => console.error('Failed to record game result', err));
  }, [roundData, user?.uid]);

  if (loading) return <LoadingScreen />;
  if (!user) return <SignInScreen />;

  return (
    <div className="app">
      <canvas ref={canvasRef} id="main-canvas" style={{ display: screen === 'game' ? 'block' : 'none', width: '100%', height: '100%' }} />
      {screen === 'dashboard' && <Dashboard onPlay={() => setScreen('menu')} />}
      {screen === 'menu' && <MenuScreen onStart={(mode, stake) => handleStart(mode, stake, undefined, lastOpponentUid)} onBack={() => setScreen('dashboard')} />}
      {isSearching && lastConfigs && <MatchmakingOverlay stake={lastConfigs.stake} connected={connected} onCancel={handleCancelSearch} onWarmup={() => { handleCancelSearch(); if (user) playVsAI(lastConfigs.stake, profile?.displayName || "Player", user.uid); }} />}
      {screen === 'game' && !hud && <LoadingScreen />}
      {screen === 'game' && hud && (
        <div className="hud">
          <button className="back-btn-game" onClick={handleQuitRequest}><ArrowLeft size={20} /></button>
          <button className="ui-toggle-btn" onClick={() => setShowUI(!showUI)}>{showUI ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          {showUI && (
            <>
              <TopBar hud={hud} userId={user.uid} />
              <PlayerPanel hud={hud} userId={user.uid} />
              <CtrlBar hud={hud} userId={user.uid} onCam={() => engine?.cycleCam()} onSkip={() => engine?.skipTurn()} onQuit={handleQuitRequest} />
              {netRoomId && <ChatBox roomId={netRoomId} />}
              <SpinController spin={hud.spin} onSpinChange={(x, z) => engine?.setSpin(x, z)} />
            </>
          )}
          {user && netRoomId && <VoiceControls roomId={netRoomId} userId={user.uid} showUI={showUI} />}
          {isMobile && hud.phase === 'aiming' && hud.players[hud.currentPlayerIndex]?.uid === user.uid && (
            <MobilePowerBar onPowerChange={(p) => engine?.setPower(p)} onFire={() => engine?.fireShot()} />
          )}
          <Notification hud={hud} />
          {hud.battleMode && <SuddenDeathBanner />}
          {showUI && (hud.phase === 'aiming' || hud.phase === 'powering') && <BallLegend targetBall={hud.targetBall} />}
          {showQuitDialog && <QuitDialog onStay={() => setShowQuitDialog(false)} onLeave={handleMenu} />}
        </div>
      )}
      {screen === 'roundEnd' && roundData && <RoundEndScreen data={roundData} rematchVotes={netRematchVotes} onReplay={handleReplay} onMenu={handleMenu} onChangeStakes={handleChangeStakes} />}
    </div>
  );
}

// ── Sub-Components ───────────────────────────────────────────

function ChatBox({ roomId }: { roomId: string }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId) return;
    return subscribeMessages(roomId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    });
  }, [roomId]);

  const handleSend = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const name = profile?.displayName || "Player";
    await sendMessage(roomId, user.uid, name, text);
    setText("");
  };

  if (!isOpen) {
    return (
      <button className="chat-toggle" onClick={() => setIsOpen(true)}>
        <MessageSquare size={18} />
        {messages.length > 0 && <span className="chat-badge">{messages.length}</span>}
      </button>
    );
  }

  return (
    <div className="chat-box">
      <div className="chat-hdr">
        <span>Game Chat</span>
        <button onClick={() => setIsOpen(false)}><X size={16} /></button>
      </div>
      <div className="chat-msgs" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.uid === user?.uid ? "me" : ""}`}>
            <div className="chat-name">{m.name}</div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={handleSend}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message..."
        />
        <button type="submit"><Send size={16} /></button>
      </form>
    </div>
  );
}

function VoiceControls({ roomId, userId, showUI }: { roomId: string; userId: string; showUI: boolean }) {
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(100);
  const managerRef = useRef<VoiceManager | null>(null);

  useEffect(() => {
    managerRef.current = new VoiceManager();
    return () => {
      managerRef.current?.stop(roomId, userId);
    };
  }, [roomId, userId]);

  const toggleVoice = async () => {
    if (!managerRef.current) return;

    // Mobile Autoplay Fix: Prime the AudioContext on first user interaction
    await managerRef.current.prime();

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (!nextMuted) {
      try {
        await managerRef.current.startLocalStream();
        await managerRef.current.joinRoom(roomId, userId);
      } catch (err) {
        console.error("Failed to start voice chat", err);
        setIsMuted(true);
      }
    } else {
      await managerRef.current.stop(roomId, userId);
      managerRef.current = new VoiceManager();
    }
  };

  useEffect(() => {
    managerRef.current?.setVolume(volume);
  }, [volume]);

  if (!showUI) return null;

  return (
    <div className="voice-ctrl">
      <button className={`voice-btn ${isMuted ? "muted" : ""}`} onClick={toggleVoice}>
        {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      <div className="voice-vol">
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(parseInt(e.target.value))}
        />
      </div>
    </div>
  );
}

function MobilePowerBar({ onPowerChange, onFire }: {
  onPowerChange: (p: number) => void;
  onFire: () => void;
}) {
  const [p, setP] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const handleTouch = (e: React.TouchEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const val = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
    const power = val * 100;
    setP(power);
    onPowerChange(power);
  };

  return (
    <div className="mobile-power-wrap">
      <div className="mobile-power-label">PULL TO SHOOT</div>
      <div
        className="mobile-power-bar"
        ref={barRef}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => {
          onFire();
          setP(0);
        }}
      >
        <div className="mobile-power-fill" style={{ height: `${p}%` }} />
        <div className="mobile-power-knob" style={{ top: `${p}%` }} />
      </div>
    </div>
  );
}

function SpinController({ spin, onSpinChange }: {
  spin: { x: number; z: number };
  onSpinChange: (x: number, z: number) => void;
}) {
  const ballRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = (clientX: number, clientY: number) => {
    if (!ballRef.current) return;
    const rect = ballRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;

    let dx = (clientX - cx) / r;
    let dy = (clientY - cy) / r;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.9) {
      dx /= dist / 0.9;
      dy /= dist / 0.9;
    }

    onSpinChange(dx, -dy);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleMove(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging]);

  return (
    <div className="spin-ctrl">
      <div className="spin-label">SPIN / ENGLISH</div>
      <div
        className="spin-ball"
        ref={ballRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className="spin-grid-v" />
        <div className="spin-grid-h" />
        <div
          className="spin-target"
          style={{
            left: `${50 + spin.x * 50}%`,
            top: `${50 - spin.z * 50}%`
          }}
        />
      </div>
      <div className="spin-desc">
        {spin.z > 0.2 ? "TOP (FOLLOW)" : spin.z < -0.2 ? "BACK (DRAW)" : "STUN"}
        {spin.x > 0.2 ? " + RIGHT" : spin.x < -0.2 ? " + LEFT" : ""}
      </div>
    </div>
  );
}

function MatchmakingOverlay({ stake, connected, onCancel, onWarmup }: {
  stake: number;
  connected: boolean;
  onCancel: () => void;
  onWarmup: () => void;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const showWarmupOption = seconds >= 120 || !connected;

  return (
    <div className="round-end" style={{ background: 'rgba(0,0,0,0.92)', zIndex: 3000 }}>
      <div className="re-box">
        <div className={connected ? "spinner" : ""} style={{ marginBottom: 20 }}>
          {!connected && <span style={{ fontSize: 40 }}>⚠️</span>}
        </div>
        <div className="re-title">
          {connected ? `FINDING A TABLE... ${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : "OFFLINE"}
        </div>
        <div className="re-winner">KSh {stake.toLocaleString()} Lounge</div>
        <div className="re-bd" style={{ marginTop: 10, textAlign: 'center' }}>
          {connected ? "Searching for other players at this stake level." : "The server is currently unreachable. Real-time multiplayer is unavailable."}
          <br/>
          Game starts with 2-5 players.
        </div>

        {showWarmupOption && (
          <div style={{ marginTop: 20, width: '100%' }}>
            <div className="re-bd" style={{ marginBottom: 12, color: 'var(--neon-g)' }}>
              {connected ? "Still searching... Want to play a free AI warmup game while you wait?" : "You can still play a free practice game against the AI."}
            </div>
            <button className="re-btn play" onClick={onWarmup} style={{ width: '100%', marginBottom: 10 }}>
              START AI WARMUP
            </button>
          </div>
        )}

        <button className="re-btn quit" onClick={onCancel} style={{ marginTop: 8, width: '100%', opacity: 0.7 }}>
          {connected ? "LEAVE QUEUE" : "BACK TO DASHBOARD"}
        </button>
      </div>
    </div>
  );
}

function MenuScreen({ onStart, onBack }: {
  onStart: (mode: 'ai' | 'pvp', stake: number) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'ai'|'pvp'>('pvp');
  const [stake, setStake] = useState(100);
  const [customStake, setCustomStake] = useState('');

  const STAKES = [50, 100, 200, 500, 1000];

  function handleStart() {
    onStart(mode, stake);
  }

  return (
    <div className="menu-screen">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={20} />
      </button>
      <div className="menu-dots"/>
      <div className="menu-wrap">
        <img src="/logo.png" alt="Killer Pool Logo" className="main-logo" />

        <div className="menu-card">
          <div className="sec-label">Game Mode</div>
          <button className={`mode-btn${mode==='pvp'?' sel':''}`} onClick={() => setMode('pvp')}>
            <div className="mode-icon mp-icon">👥</div>
            <div>
              <div>Online Multiplayer</div>
              <div className="btn-desc">Join a lounge with up to 5 players</div>
            </div>
          </button>
          <button className={`mode-btn${mode==='ai'?' sel':''}`} onClick={() => setMode('ai')}>
            <div className="mode-icon ai-icon">🤖</div>
            <div>
              <div>Human vs AI</div>
              <div className="btn-desc">Practice heads-up against the server</div>
            </div>
          </button>

          <div className="divider"/>
          <div className="sec-label">Stake (KSh)</div>
          <div className="row-grid-5">
            {STAKES.map(s => (
              <div key={s} className={`chip${stake===s&&!customStake?' sel':''}`}
                onClick={() => { setStake(s); setCustomStake(''); }}>
                {s>=1000 ? `${s/1000}K` : s}
              </div>
            ))}
          </div>
          <input
            className="stake-custom"
            type="number"
            min={10}
            placeholder="Custom amount (KSh)…"
            value={customStake}
            onChange={e => { setCustomStake(e.target.value); if(+e.target.value>0) setStake(+e.target.value); }}
          />

          <button className="start-btn" onClick={handleStart}>
            {mode === 'pvp' ? 'FIND A TABLE →' : 'ENTER THE TABLE →'}
          </button>
          <div className="balance-tag">Starting balance: <span className="neon-g">KSh {STARTING_BALANCE.toLocaleString()}</span></div>
        </div>
      </div>
    </div>
  );
}

function PlayerPanel({ hud, userId }: { hud: HUDState; userId?: string }) {
  const { players, currentPlayerIndex, targetBall } = hud;
  const maxScore = Math.max(...players.map(p => p.score), 1);
  return (
    <div className="pp">
      <div className="pp-hdr">Players</div>
      {players.map((p, i) => {
        const isCur = i === currentPlayerIndex && hud.phase !== 'roundEnd';
        const isMe = p.uid === userId;
        return (
          <div key={p.id || i} className={`pr${isCur?' cur':''}${p.isBenched?' out':''}`}>
            <div className="pr-top">
              <div className={`pr-dot${isCur?' dot-on':' dot-off'}`}/>
              <div className="pr-name">{p.name}</div>
              {p.isAI && <div className="pr-badge badge-ai">AI</div>}
              {!p.isAI && isMe && <div className="pr-badge badge-you">YOU</div>}
            </div>
            <div className={`pr-score${isMe && p.score===maxScore?' lead':''}`}>
              {p.score}
            </div>
            <div className="pr-grid">
              <div className="pr-stat">
                <div className={`ps-v g`}>{p.pots}</div>
                <div className="ps-l">POTS</div>
              </div>
              <div className="pr-stat">
                <div className={`ps-v r`}>{p.fouls}</div>
                <div className="ps-l">FOULS</div>
              </div>
              <div className="pr-stat">
                <div className={`ps-v a`}>{isMe ? (p.balance || 0).toLocaleString() : '•••'}</div>
                <div className="ps-l">KSh</div>
              </div>
            </div>
            <div className="pr-bar">
              <div className="pr-bar-fill" style={{width:`${Math.min(100,(p.score/105)*100)}%`}}/>
            </div>
            {isCur && <div className="pr-meta">Target: Ball #{targetBall} ({BALL_VALUES[targetBall]} pts)</div>}
            {p.isBenched && <div className="pr-bench">Benched</div>}
          </div>
        );
      })}
    </div>
  );
}

function TopBar({ hud, userId }: { hud: HUDState; userId?: string }) {
  const timer = hud.timeLeft;
  const warn = timer <= 20 && timer > 10;
  const danger = timer <= 10;
  const curPlayer = hud.players[hud.currentPlayerIndex];
  const isMyTurn = curPlayer && curPlayer.uid === userId;

  return (
    <div className="top-bar">
      <div className="tb-brand">
        <img src="/logo.png" alt="Logo" className="tb-logo-img" />
      </div>
      <div className="tb-center">
        <div className="hud-pill target">
          <div className="pill-lbl">Next Target</div>
          <div className="pill-val">Ball #{hud.targetBall}</div>
          <div className="pill-sub">{BALL_VALUES[hud.targetBall] ?? 0} pts</div>
        </div>
        <div className="hud-pill pool">
          <div className="pill-lbl">Prize Pool</div>
          <div className="pill-val green">KSh {hud.prizePool.toLocaleString()}</div>
        </div>
        <div className="hud-pill target">
          <div className="pill-lbl">Turn</div>
          <div className="pill-val">{curPlayer?.name ?? '—'}</div>
          <div className="pill-sub">
            {curPlayer?.isAI ? 'Thinking…' : isMyTurn ? 'Your move' : 'Waiting…'}
          </div>
        </div>
      </div>
      <div className="tb-right">
        <div>
          <div className={`timer-val${warn?' warn':danger?' danger':''}`}>{String(timer).padStart(2,'0')}</div>
          <div className="timer-lbl">TIME</div>
        </div>
      </div>
    </div>
  );
}

function CtrlBar({ hud, userId, onCam, onSkip, onQuit }: {
  hud: HUDState; userId?: string; onCam: ()=>void; onSkip: ()=>void; onQuit: ()=>void;
}) {
  const curPlayer = hud.players[hud.currentPlayerIndex];
  const isMyTurn = curPlayer && curPlayer.uid === userId;
  const isAiming = hud.phase==='aiming'||hud.phase==='powering';
  const isAITurn = curPlayer?.isAI;

  return (
    <div className="ctrl-bar">
      {isMyTurn && (
        <div className="ctrl-section">
          <div className="ctrl-lbl">Power</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className="power-track">
              <div className="power-fill" style={{width:`${hud.power}%`}}/>
            </div>
            <div className="power-num">{hud.power}%</div>
          </div>
        </div>
      )}
      <div className="hint-center">
        {isAITurn
          ? <span>AI is aiming…</span>
          : isMyTurn
            ? hud.phase==='powering'
              ? <><span>Hold</span> to charge · <span>Release</span> to shoot</>
              : <><span>Aim</span> with mouse · <span>Hold</span> left click · <span>Release</span> to shoot</>
            : <span>Waiting for {curPlayer?.name}…</span>
        }
      </div>
      <div className="action-row">
        <button className="abtn cam" onClick={onCam}>📷 CAM</button>
        {isMyTurn && isAiming &&
          <button className="abtn sec" onClick={onSkip}>FORFEIT</button>
        }
        <button className="abtn quit-btn" onClick={onQuit}>✕ QUIT</button>
      </div>
    </div>
  );
}

function QuitDialog({ onStay, onLeave }: { onStay: ()=>void; onLeave: ()=>void }) {
  return (
    <div className="quit-overlay">
      <div className="quit-box">
        <div className="quit-title">Quit this game?</div>
        <div className="quit-sub">Your progress will be lost and your stake will be forfeited.</div>
        <div className="quit-actions">
          <button className="quit-action-btn stay" onClick={onStay}>STAY</button>
          <button className="quit-action-btn leave" onClick={onLeave}>QUIT & FORFEIT</button>
        </div>
      </div>
    </div>
  );
}

function Notification({ hud }: { hud: HUDState }) {
  const r = hud.shotResult;
  if (!r) return null;
  const cls = r.type==='foul_wrong'||r.type==='foul_scratch'||r.type==='foul_baulk' ? 'bad'
            : r.type==='carom' ? 'carom'
            : r.type==='success' ? 'ok'
            : 'info';
  return (
    <div id="nz">
      <div className={`notif ${cls}`}>{r.message}</div>
    </div>
  );
}

interface RoundEndData {
  players: PlayerState[];
  winners: PlayerState[];
  payout: { pool:number; fee:number; net:number; perWinner:number };
}

function RoundEndScreen({ data, rematchVotes, onReplay, onMenu, onChangeStakes }: {
  data: RoundEndData;
  rematchVotes: Record<string, boolean>;
  onReplay: () => void;
  onMenu: () => void;
  onChangeStakes: () => void;
}) {
  const { players, winners, payout } = data;
  const isTie = winners.length > 1;

  const { user } = useAuth();
  const myVote = user ? !!rematchVotes[user.uid] : false;
  const otherVotesCount = Object.keys(rematchVotes).filter(uid => uid !== user?.uid && rematchVotes[uid]).length;
  const totalPlayers = players.length;

  return (
    <div className="round-end">
      <button className="back-btn" onClick={onMenu}>
        <ArrowLeft size={20} />
      </button>
      <div className="re-box">
        <div className="re-trophy">{isTie ? '🤝' : '🏆'}</div>
        <div className="re-title">{isTie ? 'IT\'S A TIE!' : 'VICTORY!'}</div>
        <div className="re-winner">{winners.map(w=>w.name).join(' & ')}</div>
        <div className="re-payout">
          <div className="re-ksh">KSh {(payout.perWinner || 0).toLocaleString()}</div>
          <div className="re-bd">
            Pool: {(payout.pool || 0).toLocaleString()} · Fee: {(payout.fee || 0).toLocaleString()} · Net: {(payout.net || 0).toLocaleString()}
            {isTie ? ` ÷ ${winners.length}` : ''}
          </div>
        </div>
        <div className="re-scores">
          {[...players].sort((a,b)=>b.score-a.score).map(p => (
            <div key={p.id} className="re-row">
              <div className="re-n">
                {winners.some(w=>w.id===p.id) ? '🏆 ' : ''}{p.name}
                {p.isAI ? ' (AI)' : ''}
                {rematchVotes[p.uid || ''] && <span className="rematch-label"> (Play Again ✓)</span>}
              </div>
              <div style={{display:'flex',gap:16,alignItems:'center'}}>
                <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>
                  {p.pots} pots · {p.fouls} fouls
                </span>
                <div className="re-s">{p.score} pts</div>
              </div>
            </div>
          ))}
        </div>
        <div className="re-btns">
          <button className={`re-btn play${myVote ? ' active' : ''}`} onClick={onReplay} disabled={myVote}>
            {myVote ? `WAITING... (${otherVotesCount + 1}/${totalPlayers})` : 'PLAY AGAIN'}
          </button>
          <button className="re-btn change" onClick={onChangeStakes}>CHANGE STAKES</button>
          <button className="re-btn quit" onClick={onMenu}>MENU</button>
        </div>
      </div>
    </div>
  );
}

function SuddenDeathBanner() {
  return (
    <div style={{
      position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(178,18,18,0.94)', color: '#fff', padding: '8px 22px',
      borderRadius: 10, fontWeight: 700, letterSpacing: 1, fontSize: 13,
      boxShadow: '0 6px 20px rgba(0,0,0,0.45)', zIndex: 25, whiteSpace: 'nowrap',
      border: '1px solid rgba(255,255,255,0.25)',
    }}>
      ⚔ SUDDEN DEATH — pot the 1 to win the whole pot
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner"/>
      <div className="loading-txt">Racking the table…</div>
    </div>
  );
}

function BallLegend({ targetBall }: { targetBall: number }) {
  return (
    <div className="legend">
      <div className="lg-row">
        <div className="lg-dot" style={{background:'#F5F3EC',border:'1px solid rgba(0,0,0,0.3)'}}/>
        Cue ball
      </div>
      <div className="lg-row">
        <div className="lg-dot" style={{background: BALL_COLORS[targetBall]||'#D4A012'}}/>
        Target #{targetBall}
      </div>
      <div className="lg-row">
        <div className="lg-dot" style={{background:'#E84030'}}/>
        Carom bonus
      </div>
    </div>
  );
}
