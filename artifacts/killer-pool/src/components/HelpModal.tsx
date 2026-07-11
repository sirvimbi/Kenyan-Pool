import { X, HelpCircle, Mail, MessageCircle, Info, AlertTriangle, Target } from "lucide-react";

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="quit-overlay" style={{ zIndex: 3000 }}>
      <div className="quit-box" style={{ maxWidth: 800, width: "95%", maxHeight: "90vh", overflowY: "auto", textAlign: 'left' }}>
        <button className="quit-close" onClick={onClose}><X size={20} /></button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <HelpCircle size={32} className="neon-g" />
          <div className="quit-title" style={{ margin: 0 }}>Kenyan Killer Pool: Guide</div>
        </div>

        <div className="signin-sub" style={{ marginBottom: 24, fontSize: 16 }}>
          Welcome to the streets of Nairobi! This isn't your standard 8-ball.
          It’s a fast-paced, high-stakes race to the top where strategy and precision are everything.
        </div>

        <section style={{ marginBottom: 32 }}>
          <div className="sec-label" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--neon-b)' }}>
            <Target size={18} /> 1. THE OBJECTIVE
          </div>
          <ul style={{ color: 'rgba(255,255,255,0.8)', paddingLeft: 20, lineHeight: 1.6 }}>
            <li><b>Score Points:</b> Pot balls in numerical order (3, 4, 5... up to 15).</li>
            <li><b>Win the Game:</b> Have the highest score when all balls are potted.</li>
            <li><b>The Twist:</b> If you fall too far behind mathematically, you get <b>Benched</b> (you sit out until the game ends).</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <div className="sec-label" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--neon-b)' }}>
            <Info size={18} /> 2. THE SETUP & SEQUENCE
          </div>
          <div style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            <p><b>The Golden Rule:</b> You must always hit the <b>lowest-numbered ball</b> currently on the table first.</p>
            <p><b>The Rack:</b></p>
            <ul style={{ paddingLeft: 20 }}>
              <li><b>Ball #3:</b> Sits alone on the long rail. (Worth <b>6 Points</b>)</li>
              <li><b>Balls 4-15:</b> Arranged in pairs on the cushions. Each pair adds up to 19 (e.g., 4+15, 5+14).</li>
              <li><b>Starting:</b> You start with "Ball-in-Hand" inside the <b>Baulk Box</b> (bottom area).</li>
            </ul>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <div className="sec-label" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--neon-g)' }}>
            <Target size={18} /> 3. SCORING & CAROMS
          </div>
          <ul style={{ color: 'rgba(255,255,255,0.8)', paddingLeft: 20, lineHeight: 1.6 }}>
            <li><b>Potting the Target:</b> You get points equal to the ball's value (Ball 3 = 6pts, others = face value). You keep shooting.</li>
            <li><b>Caroms:</b> If you hit the target first and other balls fall in, you get points for <b>all</b> potted balls and keep your turn!</li>
            <li><b>Missing:</b> If you don't pot the target, your turn ends. 0 points.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <div className="sec-label" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff4444' }}>
            <AlertTriangle size={18} /> 4. FOULS & PENALTIES
          </div>
          <div style={{ background: 'rgba(255,68,68,0.05)', padding: 16, borderRadius: 10, border: '1px solid rgba(255,68,68,0.2)' }}>
            <ul style={{ color: 'rgba(255,255,255,0.8)', paddingLeft: 20, margin: 0, lineHeight: 1.6 }}>
              <li><b>Scratch (Cue Ball Potted):</b> You <b>lose points</b> equal to the target ball's value. Opponent gets Ball-in-Hand.</li>
              <li><b>Wrong Contact:</b> Hitting a ball higher than the target first is a foul. You lose points for any balls potted in that shot.</li>
              <li><b>Baulk Violation:</b> If the target is inside the baulk box, you must hit a cushion outside the box before hitting the ball.</li>
            </ul>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <div className="sec-label">5. SPECIAL RULES</div>
          <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            <b>The Bench Rule:</b> If your current score plus all remaining points on the table is less than the leader's score, you are disqualified (Benched).
          </p>
          <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            <b>Tie-Breakers:</b> In case of a tie, players can choose to <b>Split</b> the pot or <b>Battle</b> (Sudden Death to pot the #1 ball).
          </p>
        </section>

        <section style={{ marginBottom: 10, padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
          <div className="sec-label" style={{ color: 'var(--gold)' }}>CONTACT & SUPPORT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.7)' }}>
              <Mail size={16} /> <span>support@kenyanpool.com</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.7)' }}>
              <MessageCircle size={16} /> <span>Join our Nairobi Lounge Community</span>
            </div>
          </div>
        </section>

        <div className="quit-actions" style={{ marginTop: 32 }}>
          <button className="quit-action-btn stay" onClick={onClose} style={{ width: '100%' }}>
            GOT IT, LET'S PLAY!
          </button>
        </div>
      </div>
    </div>
  );
}
