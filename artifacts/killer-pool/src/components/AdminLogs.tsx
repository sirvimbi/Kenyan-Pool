import { useState, useEffect } from "react";
import { fetchGameLogs } from "../firebase/game-logs";
import { X, Download, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";

export function AdminLogsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("AdminLogs: Fetching logs...");
      const data = await fetchGameLogs();
      console.log("AdminLogs: Received logs count:", data.length);
      setLogs(data);
    } catch (err: any) {
      console.error("AdminLogs: Fetch error:", err);
      setError(err.message || "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleFetch();
  }, []);

  const exportToCSV = () => {
    if (!logs || logs.length === 0) return;

    try {
      const headers = [
        "Date/Time",
        "Room ID",
        "Type",
        "Stake",
        "Prize Pool",
        "Players",
        "Participants",
        "Winners"
      ];

      const rows = logs.map(log => {
        let date = "N/A";
        if (log.timestamp) {
          if (log.timestamp.toDate) date = log.timestamp.toDate().toLocaleString();
          else if (log.timestamp.seconds) date = new Date(log.timestamp.seconds * 1000).toLocaleString();
        }

        const participants = Array.isArray(log.participants)
          ? log.participants.map((p: any) => `${p.name || 'Unknown'} (${p.uid || 'N/A'})`).join(" | ")
          : "N/A";

        const winners = Array.isArray(log.winners)
          ? log.winners.map((w: any) => w.name || 'Unknown').join(" | ")
          : "N/A";

        return [
          `"${date}"`,
          `"${log.roomId || 'N/A'}"`,
          log.isAI ? "AI" : "PvP",
          log.stake || 0,
          log.prizePool || 0,
          log.playerCount || 0,
          `"${participants}"`,
          `"${winners}"`
        ];
      });

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `game_logs_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("AdminLogs: Export error:", err);
      alert("Failed to export CSV");
    }
  };

  return (
    <div className="quit-overlay" style={{ zIndex: 2000 }}>
      <div className="quit-box" style={{ maxWidth: 700, width: "95%", maxHeight: "90vh", overflowY: "auto" }}>
        <button className="quit-close" onClick={onClose}><X size={20} /></button>
        <div className="quit-title">Game Administration</div>
        <div className="signin-sub" style={{ marginBottom: 20 }}>
          View and export game history and statistics.
        </div>

        {error && (
          <div style={{ background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', color: '#ff4444', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} />
            <div style={{ fontSize: 13 }}>{error}</div>
          </div>
        )}

        {!logs && loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40 }}>
            <Loader2 className="spinner" size={40} />
            <div className="signin-sub">Fetching logs from database...</div>
          </div>
        ) : !logs ? (
          <button className="dash-play" onClick={handleFetch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <FileSpreadsheet size={20} />
            FETCH ALL GAME LOGS
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 16, textAlign: 'left' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--neon-g)' }}>{logs.length}</div>
                <div className="sec-label">Total Games</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 16, textAlign: 'left' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold)' }}>
                  KSh {logs.reduce((sum, l) => sum + (l.prizePool || 0), 0).toLocaleString()}
                </div>
                <div className="sec-label">Total Payouts</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="signin-submit" onClick={exportToCSV} disabled={logs.length === 0} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Download size={18} /> DOWNLOAD CSV
              </button>
              <button className="quit-action-btn leave" onClick={handleFetch} disabled={loading} style={{ flex: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <Loader2 className="spinner" size={16} /> : null}
                REFRESH
              </button>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto', textAlign: 'left', fontSize: 11, border: '1px solid var(--border)', borderRadius: 8 }}>
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                 <thead style={{ position: 'sticky', top: 0, background: '#141018', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
                   <tr>
                     <th style={{ padding: 10, textAlign: 'left' }}>Date</th>
                     <th style={{ padding: 10, textAlign: 'center' }}>Type</th>
                     <th style={{ padding: 10, textAlign: 'right' }}>Stake</th>
                     <th style={{ padding: 10, textAlign: 'right' }}>Payout</th>
                     <th style={{ padding: 10, textAlign: 'center' }}>Players</th>
                   </tr>
                 </thead>
                 <tbody>
                   {logs.length === 0 ? (
                     <tr>
                       <td colSpan={5} style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>No games recorded yet.</td>
                     </tr>
                   ) : (
                     logs.map((log, i) => {
                       let date = "N/A";
                       if (log.timestamp) {
                         if (log.timestamp.toDate) date = log.timestamp.toDate().toLocaleDateString();
                         else if (log.timestamp.seconds) date = new Date(log.timestamp.seconds * 1000).toLocaleDateString();
                       }
                       return (
                         <tr key={log.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                           <td style={{ padding: 10 }}>{date}</td>
                           <td style={{ padding: 10, textAlign: 'center' }}>{log.isAI ? '🤖' : '👥'}</td>
                           <td style={{ padding: 10, textAlign: 'right' }}>{log.stake?.toLocaleString()}</td>
                           <td style={{ padding: 10, textAlign: 'right', color: 'var(--neon-g)' }}>{log.prizePool?.toLocaleString()}</td>
                           <td style={{ padding: 10, textAlign: 'center' }}>{log.playerCount}</td>
                         </tr>
                       );
                     })
                   )}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        <div className="quit-actions" style={{ marginTop: 24 }}>
          <button className="quit-action-btn stay" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}
