import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchLeaderboard,
  type LeaderboardEntry,
} from "../firebase/profile";
import { getTierProgress, TIERS } from "../game/tiers";

export default function Dashboard({ onPlay }: { onPlay: () => void }) {
  const { profile, user, signOut } = useAuth();
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [boardError, setBoardError] = useState(false);

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
            <div className="dash-logo">KILLER POOL</div>
            <div className="dash-city">♦ NAIROBI NIGHTS ♦</div>
          </div>
          <div className="dash-account">
            <div className="dash-account-name">{profile.displayName}</div>
            <button className="dash-signout" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>

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
