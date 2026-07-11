import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchLeaderboard,
  type LeaderboardEntry,
} from "../firebase/profile";
import { getTierProgress, TIERS } from "../game/tiers";
import { sound } from "../game/sound";
import { usePaystackPayment } from "react-paystack";
import { Zap, Sparkles, Coins, ShoppingBag, X, HelpCircle } from "lucide-react";
import { AdminLogsModal } from "../components/AdminLogs";
import { HelpModal } from "../components/HelpModal";

const PAYSTACK_PUBLIC_KEY = "pk_test_8e67e2d153444b7061b5fc6878e744c897084296";

const PRODUCTS = [
  { id: "pool200", credits: 10000, price: 200, label: "Diamond Bundle", icon: <Sparkles size={20} /> },
  { id: "pool100", credits: 5000, price: 100, label: "Pro Pack", icon: <Zap size={20} /> },
  { id: "pool50", credits: 2000, price: 50, label: "Starter Kit", icon: <Coins size={20} /> },
  { id: "pool10", credits: 1000, price: 10, label: "Grubstake", icon: <ShoppingBag size={20} /> },
];

function BillingModal({ onClose }: { onClose: () => void }) {
  const { user, addCredits } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSuccess = (credits: number) => {
    addCredits(credits).then(() => {
      setMsg("Credits added successfully!");
      setTimeout(onClose, 2000);
    });
  };

  const handleClose = () => {
    setBusy(false);
  };

  return (
    <div className="quit-overlay" style={{ zIndex: 1000 }}>
      <div className="quit-box" style={{ textAlign: "left", maxWidth: 450, width: "95%" }}>
        <button className="quit-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="quit-title" style={{ textAlign: "center", marginBottom: 20 }}>
          Buy Credits
        </div>
        <div className="signin-sub" style={{ textAlign: "center", marginBottom: 20 }}>
          Refill your wallet to keep playing.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PRODUCTS.map((p) => {
            const config: any = {
              reference: new Date().getTime().toString(),
              email: user?.email || "guest@kenyanpool.com",
              amount: p.price * 100, // Paystack amount is in kobo/cents
              publicKey: PAYSTACK_PUBLIC_KEY,
              currency: "KES",
              metadata: {
                custom_fields: [
                  { display_name: "Product", variable_name: "product", value: p.id },
                  { display_name: "User ID", variable_name: "user_id", value: user?.uid },
                  { display_name: "Credits", variable_name: "credits", value: p.credits.toString() }
                ]
              },
              callback_url: "https://us-central1-kenyan-pool.cloudfunctions.net/paystackCallback"
            };

            const initializePayment = usePaystackPayment(config);

            return (
              <button
                key={p.id}
                className="mode-btn"
                style={{ justifyContent: "space-between", padding: "16px 20px" }}
                onClick={() => {
                  setBusy(true);
                  // Attempting to pass callbacks as separate arguments while bypassing strict type checking
                  // which is often mismatched in different react-paystack versions.
                  // @ts-ignore
                  initializePayment(() => handleSuccess(p.credits), handleClose);
                }}
                disabled={busy}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="mode-icon" style={{ color: "var(--gold)" }}>{p.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.label}</div>
                    <div className="btn-desc" style={{ color: "var(--neon-g)" }}>
                      +{p.credits.toLocaleString()} Credits
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  KES {p.price}
                </div>
              </button>
            );
          })}
        </div>

        {msg && (
          <div className="signin-sub" style={{ textAlign: "center", marginTop: 16, color: "var(--neon-g)" }}>
            {msg}
          </div>
        )}

        <div className="quit-actions" style={{ marginTop: 24 }}>
          <button className="quit-action-btn leave" onClick={onClose} disabled={busy}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ onClose, onOpenBilling, onOpenAdmin }: { onClose: () => void; onOpenBilling: () => void; onOpenAdmin: () => void }) {
  const { profile, updateDisplayName, user } = useAuth();
  const [name, setName] = useState(profile?.displayName || "");
  const [vol, setVol] = useState(sound.getVolume() * 100);
  const [muted, setMuted] = useState(sound.getMuted());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSaveName() {
    if (!name.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await updateDisplayName(name);
      setMsg("Name updated!");
      setTimeout(() => setMsg(""), 2000);
    } catch (err: any) {
      console.error("Save Name Error:", err);
      setMsg(`Error: ${err.message || "Failed to update name."}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quit-overlay" style={{ zIndex: 500 }}>
      <div className="quit-box" style={{ textAlign: "left", maxWidth: 400 }}>
        <button className="quit-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="quit-title" style={{ textAlign: "center", marginBottom: 20 }}>
          Settings
        </div>

        <div className="settings-section">
          <div className="sec-label">Display Name</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              className="signin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            <button
              className="signin-submit"
              style={{ width: "auto", padding: "0 16px" }}
              onClick={handleSaveName}
              disabled={busy}
            >
              Save
            </button>
          </div>
          {msg && <div className="signin-sub" style={{ marginTop: 4, color: "var(--neon-g)" }}>{msg}</div>}
        </div>

        <div className="settings-section" style={{ marginTop: 20 }}>
          <div className="sec-label">Audio</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button
              className={`chip ${muted ? "sel" : ""}`}
              style={{ height: 32, width: 80 }}
              onClick={() => {
                const m = !muted;
                setMuted(m);
                sound.setMuted(m);
              }}
            >
              {muted ? "Muted" : "Mute"}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={vol}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setVol(v);
                sound.setVolume(v / 100);
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, minWidth: 30 }}>{vol}%</span>
          </div>
        </div>

        <div className="settings-section" style={{ marginTop: 20 }}>
          <div className="sec-label">Billing</div>
          <button
            className="signin-submit"
            style={{ marginTop: 8, background: "linear-gradient(135deg, #00FF88, #00A36C)" }}
            onClick={onOpenBilling}
          >
            BUY CREDITS
          </button>
        </div>

        <div className="settings-section" style={{ marginTop: 20 }}>
          <div className="sec-label">Account</div>
          <div className="signin-sub" style={{ textAlign: "left", marginTop: 6 }}>
            Logged in as <b>{user?.email || "Guest"}</b>
          </div>
          {user?.uid === "GsggRvZaVeZfSuHvFfmFm7Ek6iO2" && (
            <button
              className="dash-signout"
              style={{ marginTop: 10, width: '100%', borderColor: 'var(--neon-b)', color: 'var(--neon-b)' }}
              onClick={onOpenAdmin}
            >
              ADMIN CONSOLE
            </button>
          )}
        </div>

        <div className="quit-actions" style={{ marginTop: 32 }}>
          <button className="quit-action-btn stay" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onPlay }: { onPlay: () => void }) {
  const { profile, user, signOut, error } = useAuth();
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [boardError, setBoardError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hasPrompted, setHasPrompted] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setPaymentMsg("Payment successful! Your credits will be updated shortly.");
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => setPaymentMsg(""), 5000);
    } else if (params.get("payment") === "failed") {
      setPaymentMsg("Payment failed. Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => setPaymentMsg(""), 5000);
    }
  }, []);

  useEffect(() => {
    if (profile && profile.wallet.play < 1000 && !hasPrompted) {
      setShowBilling(true);
      setHasPrompted(true);
    }
    if (profile && profile.wallet.play >= 1000) {
      setHasPrompted(false);
    }
  }, [profile?.wallet.play, hasPrompted]);

  useEffect(() => {
    let active = true;
    fetchLeaderboard(10)
      .then((b) => {
        if (active) setBoard(b);
      })
      .catch(() => {
        if (active) setBoardError(true);
      });
    return () => {
      active = false;
    };
  }, [profile?.wallet.play, profile?.stats.wins]);

  if (error) {
    return (
      <div className="dash-screen">
        <div className="dash-dots" />
        <div className="dash-wrap">
          <div className="signin-card">
            <div className="signin-title">Profile Error</div>
            <div className="signin-error" style={{ marginBottom: 20 }}>
              {error}
            </div>
            <div className="signin-sub">
              This usually happens if <b>Cloud Firestore</b> is not enabled or
              security rules are blocking access.
            </div>
            <button
              className="signin-submit"
              onClick={() => signOut()}
              style={{ marginTop: 20 }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="dash-screen">
        <div className="dash-loading">Loading your profile…</div>
      </div>
    );
  }

  const tp = getTierProgress(profile.stats);

  return (
    <div className="dash-screen">
      <div className="dash-dots" />
      <div className="dash-wrap">
        {/* Header */}
        <div className="dash-header">
          <div className="dash-brand">
            <img src="/logo.png" alt="Killer Pool Logo" className="dash-logo-img" />
          </div>
          <div className="dash-account">
            <div className="dash-account-name">{profile.displayName}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="dash-signout" style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: 'var(--neon-g)', color: 'var(--neon-g)' }} onClick={() => setShowHelp(true)}>
                <HelpCircle size={14} /> Help
              </button>
              <button className="dash-signout" onClick={() => setShowSettings(true)}>
                Settings
              </button>
              <button className="dash-signout" onClick={() => signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </div>

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onOpenBilling={() => {
              setShowSettings(false);
              setShowBilling(true);
            }}
            onOpenAdmin={() => {
              setShowSettings(false);
              setShowAdmin(true);
            }}
          />
        )}
        {showBilling && <BillingModal onClose={() => setShowBilling(false)} />}
        {showAdmin && <AdminLogsModal onClose={() => setShowAdmin(false)} />}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

        {paymentMsg && (
          <div className="signin-sub" style={{ textAlign: "center", marginBottom: 20, color: "var(--neon-g)", background: "rgba(0,255,136,0.1)", padding: "10px", borderRadius: "8px" }}>
            {paymentMsg}
          </div>
        )}

        <div className="dash-grid">
          {/* Left column: balance + tier + play */}
          <div className="dash-col">
            <div className="dash-card balance-card">
              <div className="dash-card-label">Your balance</div>
              <div className="dash-balance">
                <span className="dash-ksh">KSh</span>{" "}
                {profile.wallet.play.toLocaleString()}
              </div>
              <div className="dash-balance-sub">Play money</div>
            </div>

            <div className="dash-card tier-card">
              <div className="dash-card-label">Your rank</div>
              <div className="tier-head">
                <span
                  className="tier-badge"
                  style={{ color: tp.tier.color }}
                >
                  {tp.tier.badge}
                </span>
                <span className="tier-name" style={{ color: tp.tier.color }}>
                  {tp.tier.name}
                </span>
              </div>
              {tp.next ? (
                <>
                  <div className="tier-prog-track">
                    <div
                      className="tier-prog-fill"
                      style={{
                        width: `${Math.round(tp.progress * 100)}%`,
                        background: tp.next.color,
                      }}
                    />
                  </div>
                  <div className="tier-prog-label">
                    {tp.winsForNext} more{" "}
                    {tp.winsForNext === 1 ? "win" : "wins"} to{" "}
                    <span style={{ color: tp.next.color }}>
                      {tp.next.badge} {tp.next.name}
                    </span>
                  </div>
                </>
              ) : (
                <div className="tier-prog-label">
                  Top tier reached — you're a {tp.tier.name}! 👑
                </div>
              )}

              <div className="tier-stats">
                <div className="tier-stat">
                  <div className="ts-v">{profile.stats.gamesPlayed}</div>
                  <div className="ts-l">Games</div>
                </div>
                <div className="tier-stat">
                  <div className="ts-v">{profile.stats.wins}</div>
                  <div className="ts-l">Wins</div>
                </div>
                <div className="tier-stat">
                  <div className="ts-v">
                    {profile.stats.biggestPot.toLocaleString()}
                  </div>
                  <div className="ts-l">Biggest pot</div>
                </div>
              </div>
            </div>

            <button className="dash-play" onClick={onPlay}>
              PLAY ▶
            </button>
          </div>

          {/* Right column: leaderboard + tier ladder */}
          <div className="dash-col">
            <div className="dash-card board-card">
              <div className="dash-card-label">Top winners</div>
              {boardError && (
                <div className="board-empty">
                  Couldn't load the leaderboard.
                </div>
              )}
              {!boardError && board === null && (
                <div className="board-empty">Loading leaderboard…</div>
              )}
              {!boardError && board && board.length === 0 && (
                <div className="board-empty">No players yet — be the first!</div>
              )}
              {!boardError && board && board.length > 0 && (
                <div className="board-list">
                  {board.map((entry, i) => {
                    const isMe = entry.uid === user?.uid;
                    return (
                      <div
                        key={entry.uid}
                        className={`board-row${isMe ? " me" : ""}`}
                      >
                        <div className={`board-rank rank-${i + 1}`}>
                          {i + 1}
                        </div>
                        <div className="board-name">
                          {entry.displayName}
                          {isMe && <span className="board-you">YOU</span>}
                        </div>
                        <div className="board-wins">{entry.wins}W</div>
                        <div className="board-bal">
                          KSh {entry.balance.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="dash-card ladder-card">
              <div className="dash-card-label">Tier ladder</div>
              <div className="ladder-list">
                {TIERS.map((t) => (
                  <div
                    key={t.key}
                    className={`ladder-row${t.key === tp.tier.key ? " active" : ""}`}
                  >
                    <span className="ladder-badge" style={{ color: t.color }}>
                      {t.badge}
                    </span>
                    <span className="ladder-name">{t.name}</span>
                    <span className="ladder-req">
                      {t.minWins === 0 ? "Start" : `${t.minWins}+ wins`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
