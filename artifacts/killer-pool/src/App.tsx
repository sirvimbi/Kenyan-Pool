import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine } from "./game/engine";
import { HUDState, PlayerConfig, BALL_VALUES, BALL_COLORS, STARTING_BALANCE } from "./game/types";

// ── Menu Screen ──────────────────────────────────────────────
function MenuScreen({ onStart }: { onStart: (configs: PlayerConfig[], stake: number) => void }) {
  const [mode, setMode] = useState<'ai'|'mp'>('ai');
  const [numPlayers, setNumPlayers] = useState(2);
  const [stake, setStake] = useState(100);
  const [customStake, setCustomStake] = useState('');

  const STAKES = [50, 100, 200, 500, 1000];

  const netPool = Math.floor(stake * (mode==='ai' ? 2 : numPlayers) * 0.9);

  function handleStart() {
    let configs: PlayerConfig[];
    if (mode === 'ai') {
      configs = [{ name:'You', isAI:false }, { name:'AI', isAI:true }];
    } else {
      configs = Array.from({length: numPlayers}, (_,i) => ({
        name: `Player ${i+1}`,
        isAI: false,
      }));
    }
    onStart(configs, stake);
  }

  return (
    <div className="menu-screen">
      <div className="menu-dots"/>
      <div className="menu-wrap">
        <div className="logo">KILLER<br/>POOL</div>
        <div className="logo-sub">KENYAN CUSHION EDITION</div>
        <div className="nairobi-tag">♦ NAIROBI NIGHTS ♦</div>

        <div className="menu-card">
          <div className="sec-label">Game Mode</div>
          <button className={`mode-btn${mode==='ai'?' sel':''}`} onClick={() => setMode('ai')}>
            <div className="mode-icon ai-icon">🤖</div>
            <div>
              <div>Human vs AI</div>
              <div className="btn-desc">1v1 — heads-up against the house bot</div>
            </div>
          </button>
          <button className={`mode-btn${mode==='mp'?' sel':''}`} onClick={() => setMode('mp')}>
            <div className="mode-icon mp-icon">👥</div>
            <div>
              <div>Multiplayer · Pass &amp; Play</div>
              <div className="btn-desc">2–5 players on same device</div>
            </div>
          </button>

          {mode==='mp' && (
            <div className="mp-opts">
              <div className="sec-label">Number of Players</div>
              <div className="row-grid">
                {[2,3,4,5].map(n => (
                  <div key={n} className={`chip${numPlayers===n?' sel':''}`} onClick={()=>setNumPlayers(n)}>{n}</div>
                ))}
              </div>
            </div>
          )}

          <div className="divider"/>
          <div className="sec-label">Stake per Player (KSh)</div>
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

          <div className="divider"/>
          <div className="pool-preview-row">
            <span>Prize pool (net after 10% fee)</span>
            <span className="pool-val">KSh {netPool.toLocaleString()}</span>
          </div>

          <button className="start-btn" onClick={handleStart}>ENTER THE TABLE →</button>
          <div className="balance-tag">Starting balance: <span className="neon-g">KSh {STARTING_BALANCE.toLocaleString()}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── HUD / Game Screen ─────────────────────────────────────────
function PlayerPanel({ hud }: { hud: HUDState }) {
  const { players, currentPlayerIndex, targetBall } = hud;
  const maxScore = Math.max(...players.map(p => p.score), 1);
  return (
    <div className="pp">
      <div className="pp-hdr">Players</div>
      {players.map((p, i) => {
        const isCur = i === currentPlayerIndex && hud.phase !== 'roundEnd';
        return (
          <div key={p.id} className={`pr${isCur?' cur':''}${p.isBenched?' out':''}`}>
            <div className="pr-top">
              <div className={`pr-dot${isCur?' dot-on':' dot-off'}`}/>
              <div className="pr-name">{p.name}</div>
              {p.isAI && <div className="pr-badge badge-ai">AI</div>}
              {!p.isAI && i===0 && <div className="pr-badge badge-you">YOU</div>}
            </div>
            <div className={`pr-score${i===0&&p.score===maxScore?' lead':''}`}>
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
                <div className={`ps-v a`}>{p.balance.toLocaleString()}</div>
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

function TopBar({ hud }: { hud: HUDState }) {
  const timer = hud.timeLeft;
  const warn = timer <= 20 && timer > 10;
  const danger = timer <= 10;
  return (
    <div className="top-bar">
      <div className="tb-brand">
        <div className="tb-logo">KILLER</div>
        <div className="tb-city">NAIROBI</div>
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
          <div className="pill-val">{hud.players[hud.currentPlayerIndex]?.name ?? '—'}</div>
          <div className="pill-sub">{hud.players[hud.currentPlayerIndex]?.isAI ? 'Thinking…' : 'Your move'}</div>
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

function CtrlBar({ hud, onCam, onSkip, onQuit }: {
  hud: HUDState; onCam: ()=>void; onSkip: ()=>void; onQuit: ()=>void;
}) {
  const isAiming = hud.phase==='aiming'||hud.phase==='powering';
  const isAITurn = hud.players[hud.currentPlayerIndex]?.isAI;
  return (
    <div className="ctrl-bar">
      <div className="ctrl-section">
        <div className="ctrl-lbl">Power</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className="power-track">
            <div className="power-fill" style={{width:`${hud.power}%`}}/>
          </div>
          <div className="power-num">{hud.power}%</div>
        </div>
      </div>
      <div className="hint-center">
        {isAITurn
          ? <span>AI is aiming…</span>
          : hud.phase==='powering'
            ? <><span>Hold</span> to charge · <span>Release</span> to shoot</>
            : <><span>Aim</span> with mouse · <span>Hold</span> left click · <span>Release</span> to shoot</>
        }
      </div>
      <div className="action-row">
        <button className="abtn cam" onClick={onCam}>📷 CAM</button>
        {!isAITurn && isAiming &&
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
        <div className="quit-title">Leave this game?</div>
        <div className="quit-sub">Your progress will be lost.</div>
        <div className="quit-actions">
          <button className="quit-action-btn stay" onClick={onStay}>STAY</button>
          <button className="quit-action-btn leave" onClick={onLeave}>LEAVE</button>
        </div>
      </div>
    </div>
  );
}

function Notification({ hud }: { hud: HUDState }) {
  const r = hud.shotResult;
  if (!r) return null;
  const cls = r.type==='foul_wrong'||r.type==='foul_scratch' ? 'bad'
            : r.type==='carom' ? 'carom'
            : r.type==='success' ? 'ok'
            : 'info';
  return (
    <div id="nz">
      <div className={`notif ${cls}`}>{r.message}</div>
    </div>
  );
}

// ── Round End Screen ──────────────────────────────────────────
interface RoundEndData {
  players: import('./game/types').PlayerState[];
  winners: import('./game/types').PlayerState[];
  payout: { pool:number; fee:number; net:number; perWinner:number };
}

function RoundEndScreen({ data, onReplay, onMenu, onChangeStakes }: {
  data: RoundEndData;
  onReplay: () => void;
  onMenu: () => void;
  onChangeStakes: () => void;
}) {
  const { players, winners, payout } = data;
  const isTie = winners.length > 1;
  return (
    <div className="round-end">
      <div className="re-box">
        <div className="re-trophy">{isTie ? '🤝' : '🏆'}</div>
        <div className="re-title">{isTie ? 'IT\'S A TIE!' : 'VICTORY!'}</div>
        <div className="re-winner">{winners.map(w=>w.name).join(' & ')}</div>
        <div className="re-payout">
          <div className="re-ksh">KSh {payout.perWinner.toLocaleString()}</div>
          <div className="re-bd">
            Pool: {payout.pool.toLocaleString()} · Fee: {payout.fee.toLocaleString()} · Net: {payout.net.toLocaleString()}
            {isTie ? ` ÷ ${winners.length}` : ''}
          </div>
        </div>
        <div className="re-scores">
          {[...players].sort((a,b)=>b.score-a.score).map(p => (
            <div key={p.id} className="re-row">
              <div className="re-n">
                {winners.some(w=>w.id===p.id) ? '🏆 ' : ''}{p.name}
                {p.isAI ? ' (AI)' : ''}
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
          <button className="re-btn play" onClick={onReplay}>PLAY AGAIN</button>
          <button className="re-btn change" onClick={onChangeStakes}>CHANGE STAKES</button>
          <button className="re-btn quit" onClick={onMenu}>MENU</button>
        </div>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner"/>
      <div className="loading-txt">Racking the table…</div>
    </div>
  );
}

// ── Ball Legend ───────────────────────────────────────────────
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

// ── Main App ──────────────────────────────────────────────────
type Screen = 'loading' | 'menu' | 'game' | 'roundEnd';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [hud, setHud] = useState<HUDState | null>(null);
  const [roundData, setRoundData] = useState<RoundEndData | null>(null);
  const [lastConfigs, setLastConfigs] = useState<{ configs: PlayerConfig[]; stake: number } | null>(null);
  const [showQuitDialog, setShowQuitDialog] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Init engine once
  useEffect(() => {
    const eng = new GameEngine();
    engineRef.current = eng;
    eng.on('hud', (data) => setHud(data as HUDState));
    eng.on('roundEnd', (data) => {
      setRoundData(data as RoundEndData);
      setScreen('roundEnd');
    });
    setScreen('menu');
    return () => { eng.dispose(); };
  }, []);

  // Init canvas when switching to game
  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    const eng = engineRef.current;
    if (!canvas || !eng) return;
    setTimeout(() => {
      if (!eng['renderer']) eng.init(canvas);
    }, 50);
  }, [screen]);

  const handleStart = useCallback((configs: PlayerConfig[], stake: number) => {
    setLastConfigs({ configs, stake });
    setScreen('game');
    setShowQuitDialog(false);
    const eng = engineRef.current;
    const canvas = canvasRef.current;
    if (!eng || !canvas) return;
    setTimeout(() => {
      if (!eng['renderer']) eng.init(canvas);
      eng.startGame(configs, stake);
    }, 80);
  }, []);

  const handleReplay = useCallback(() => {
    if (!lastConfigs) { setScreen('menu'); return; }
    setScreen('game');
    setShowQuitDialog(false);
    setTimeout(() => {
      engineRef.current?.startGame(lastConfigs.configs, lastConfigs.stake);
    }, 80);
  }, [lastConfigs]);

  const handleMenu = useCallback(() => {
    setScreen('menu');
    setShowQuitDialog(false);
  }, []);

  const handleChangeStakes = useCallback(() => {
    setScreen('menu');
    setShowQuitDialog(false);
  }, []);

  const handleQuitRequest = useCallback(() => {
    setShowQuitDialog(true);
  }, []);

  return (
    <div className="app">
      {/* Always-present canvas */}
      <canvas
        ref={canvasRef}
        id="main-canvas"
        style={{ display: screen === 'game' ? 'block' : 'none' }}
      />

      {screen === 'loading' && <LoadingScreen />}

      {screen === 'menu' && (
        <MenuScreen onStart={handleStart} />
      )}

      {screen === 'game' && hud && (
        <div className="hud">
          <TopBar hud={hud} />
          <PlayerPanel hud={hud} />
          <CtrlBar
            hud={hud}
            onCam={() => engineRef.current?.cycleCam()}
            onSkip={() => engineRef.current?.skipTurn()}
            onQuit={handleQuitRequest}
          />
          <Notification hud={hud} />
          {(hud.phase === 'aiming' || hud.phase === 'powering') && (
            <BallLegend targetBall={hud.targetBall} />
          )}
          {showQuitDialog && (
            <QuitDialog
              onStay={() => setShowQuitDialog(false)}
              onLeave={handleMenu}
            />
          )}
        </div>
      )}

      {screen === 'roundEnd' && roundData && (
        <RoundEndScreen
          data={roundData}
          onReplay={handleReplay}
          onMenu={handleMenu}
          onChangeStakes={handleChangeStakes}
        />
      )}
    </div>
  );
}
