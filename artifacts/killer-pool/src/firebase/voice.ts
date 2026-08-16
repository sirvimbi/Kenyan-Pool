import { ref, set, update, onValue, off, push, child, onChildAdded, serverTimestamp, remove, onDisconnect } from "firebase/database";
import { getRtdb, isFirebaseConfigured } from "./config";

const PEERS_PATH = "voice_peers";
interface PeerConnection { pc: RTCPeerConnection; audio: HTMLAudioElement; unsubscribers: (() => void)[]; }
function pairKey(a: string, b: string) { return [a, b].sort().join("__"); }
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
  const env = (import.meta as any).env || {};
  if (env.VITE_TURN_URL && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    servers.push({ urls: env.VITE_TURN_URL, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  return servers;
}

export class VoiceManager {
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerConnection>();
  private unsubscribers: (() => void)[] = [];
  private volume = 1;
  private roomId: string | null = null;
  private userId: string | null = null;
  private isPrimed = false;

  async startLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
      return this.localStream;
    } catch (err) { console.error("Voice: Error accessing microphone:", err); throw err; }
  }

  async prime() {
    if (this.isPrimed) return;
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        gain.gain.value = 0; osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.05);
      }
      this.isPrimed = true;
    } catch (e) { console.warn("Voice: Audio priming failed", e); }
  }

  setVolume(vol: number) { this.volume = Math.max(0, Math.min(1, vol / 100)); this.peers.forEach(p => { p.audio.volume = this.volume; }); }

  async joinRoom(roomId: string, userId: string) {
    if (!isFirebaseConfigured || !this.localStream) return;
    await this.stop();
    this.roomId = roomId; this.userId = userId;
    const db = getRtdb();
    const presenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence/${userId}`);
    await onDisconnect(presenceRef).update({ online: false, leftAt: serverTimestamp() }).catch(() => {});
    await set(presenceRef, { online: true, joinedAt: serverTimestamp() });

    const allPresenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence`);
    const onPresence = onValue(allPresenceRef, snap => {
      const data = snap.val() || {};
      Object.keys(data).forEach(peerId => {
        if (peerId === userId || !data[peerId]?.online || this.peers.has(peerId)) return;
        this.setupPeer(peerId, userId < peerId).catch(err => {
          console.warn("Voice: peer setup failed", peerId, err);
          this.closePeer(peerId);
        });
      });
    });
    this.unsubscribers.push(() => off(allPresenceRef, "value", onPresence));
  }

  private async setupPeer(peerId: string, isOfferer: boolean) {
    if (!this.roomId || !this.userId || this.peers.has(peerId)) return;
    const db = getRtdb();
    const pair = pairKey(this.userId, peerId);
    const signalRef = ref(db, `${PEERS_PATH}/${this.roomId}/signals/${pair}`);
    const peerEntry: PeerConnection = {
      pc: new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: "max-bundle", rtcpMuxPolicy: "require", iceCandidatePoolSize: 4 }),
      audio: new Audio(),
      unsubscribers: [],
    };
    const pc = peerEntry.pc; const audio = peerEntry.audio;
    const pendingCandidates: RTCIceCandidateInit[] = [];
    audio.autoplay = true; audio.volume = this.volume; audio.style.display = "none";
    document.body.appendChild(audio);
    this.peers.set(peerId, peerEntry);
    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.ontrack = event => {
      const stream = event.streams[0]; if (!stream) return;
      audio.srcObject = stream;
      audio.play().catch(() => {
        const resume = () => { audio.play().catch(() => {}); document.removeEventListener("pointerdown", resume); document.removeEventListener("touchstart", resume); };
        document.addEventListener("pointerdown", resume, { once: true, passive: true });
        document.addEventListener("touchstart", resume, { once: true, passive: true });
      });
    };
    pc.onicecandidate = event => {
      if (!event.candidate || !this.userId) return;
      push(child(signalRef, `candidates/${this.userId}`), event.candidate.toJSON()).catch(() => {});
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" || pc.connectionState === "closed") this.closePeer(peerId); };

    const applyPendingCandidates = async () => {
      if (!pc.remoteDescription || pendingCandidates.length === 0) return;
      const candidates = pendingCandidates.splice(0);
      for (const candidate of candidates) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };

    const signalListener = onValue(signalRef, async snap => {
      const signal = snap.val() || {};
      try {
        if (!isOfferer && signal.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          await applyPendingCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await update(signalRef, { answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
        } else if (isOfferer && signal.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          await applyPendingCandidates();
        }
      } catch (err) { console.warn("Voice: signaling negotiation failed", err); this.closePeer(peerId); }
    });
    peerEntry.unsubscribers.push(() => off(signalRef, "value", signalListener));

    const remoteCandidatesRef = child(signalRef, `candidates/${peerId}`);
    const candidateListener = onChildAdded(remoteCandidatesRef, snap => {
      const candidate = snap.val() as RTCIceCandidateInit | null; if (!candidate) return;
      if (pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      else pendingCandidates.push(candidate);
    });
    peerEntry.unsubscribers.push(() => off(remoteCandidatesRef, "child_added", candidateListener));

    if (isOfferer) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await update(signalRef, { offer: { type: offer.type, sdp: offer.sdp }, answer: null, updatedAt: serverTimestamp() });
    }
  }

  private closePeer(peerId: string) {
    const entry = this.peers.get(peerId); if (!entry) return;
    entry.unsubscribers.forEach(u => u()); entry.pc.close(); entry.audio.pause(); entry.audio.srcObject = null; entry.audio.remove();
    this.peers.delete(peerId);
  }

  async stop(roomId?: string, userId?: string) {
    const rid = roomId || this.roomId; const uid = userId || this.userId; const peerIds = [...this.peers.keys()];
    if (rid && uid && isFirebaseConfigured) {
      const removals: Record<string, null> = {};
      removals[`${PEERS_PATH}/${rid}/presence/${uid}`] = null;
      for (const peerId of peerIds) removals[`${PEERS_PATH}/${rid}/signals/${pairKey(uid, peerId)}`] = null;
      await update(ref(getRtdb()), removals).catch(() => {});
    }
    peerIds.forEach(peerId => this.closePeer(peerId));
    this.unsubscribers.forEach(u => u()); this.unsubscribers = [];
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
    this.roomId = null; this.userId = null;
  }
}