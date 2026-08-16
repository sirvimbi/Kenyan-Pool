import {
  ref, set, update, onValue, off, push, child, onChildAdded,
  serverTimestamp, remove, onDisconnect
} from 'firebase/database';
import { getRtdb, isFirebaseConfigured } from './config';

const PEERS_PATH = 'voice_peers';

interface PeerConnection {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  unsubscribers: (() => void)[];
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];
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
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async startLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      return this.localStream;
    } catch (err) {
      console.error('Voice: microphone access failed:', err);
      throw err;
    }
  }

  async prime() {
    if (this.isPrimed) return;
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
      }
      this.isPrimed = true;
    } catch (err) {
      console.warn('Voice: audio priming failed', err);
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol / 100));
    this.peers.forEach(peer => { peer.audio.volume = this.volume; });
  }

  async joinRoom(roomId: string, userId: string) {
    if (!isFirebaseConfigured || !this.localStream) return;
    await this.stop();
    this.roomId = roomId;
    this.userId = userId;
    const db = getRtdb();
    const presenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence/${userId}`);

    await onDisconnect(presenceRef).update({ online: false, leftAt: serverTimestamp() }).catch(() => {});
    await set(presenceRef, { online: true, joinedAt: serverTimestamp() });

    // The established signaling layout is deliberately retained here because
    // Firebase rules already permit each user's nested signal branch.
    const allPresenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence`);
    const presenceListener = onValue(allPresenceRef, snap => {
      const data = snap.val() || {};
      Object.keys(data).forEach(peerId => {
        if (peerId === userId || !data[peerId]?.online || this.peers.has(peerId)) return;
        if (userId < peerId) {
          this.setupPeer(peerId, true).catch(err => console.warn('Voice: offer setup failed', err));
        }
      });
    });
    this.unsubscribers.push(() => off(allPresenceRef, 'value', presenceListener));

    // Callees listen for offers addressed to their own branch.
    const incomingSignalsRef = ref(db, `${PEERS_PATH}/${roomId}/signals/${userId}`);
    const incomingListener = onChildAdded(incomingSignalsRef, snap => {
      const peerId = snap.key;
      const signal = snap.val();
      if (!peerId || !signal?.offer || this.peers.has(peerId)) return;
      this.setupPeer(peerId, false, signal.offer).catch(err => console.warn('Voice: answer setup failed', err));
    });
    this.unsubscribers.push(() => off(incomingSignalsRef, 'child_added', incomingListener));
  }

  private async setupPeer(peerId: string, isOfferer: boolean, remoteOffer?: RTCSessionDescriptionInit) {
    if (!this.roomId || !this.userId || this.peers.has(peerId)) return;
    const db = getRtdb();
    const signalPath = isOfferer
      ? `${PEERS_PATH}/${this.roomId}/signals/${peerId}/${this.userId}`
      : `${PEERS_PATH}/${this.roomId}/signals/${this.userId}/${peerId}`;
    const signalRef = ref(db, signalPath);
    const pendingCandidates: RTCIceCandidateInit[] = [];

    const pc = new RTCPeerConnection({
      iceServers: iceServers(),
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 4,
    });
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = this.volume;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    const entry: PeerConnection = { pc, audio, unsubscribers: [] };
    this.peers.set(peerId, entry);

    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.ontrack = event => {
      const stream = event.streams[0];
      if (!stream) return;
      audio.srcObject = stream;
      audio.play().catch(() => {
        const resume = () => {
          audio.play().catch(() => {});
          document.removeEventListener('pointerdown', resume);
          document.removeEventListener('touchstart', resume);
        };
        document.addEventListener('pointerdown', resume, { once: true, passive: true });
        document.addEventListener('touchstart', resume, { once: true, passive: true });
      });
    };

    pc.onicecandidate = event => {
      if (!event.candidate || !this.userId) return;
      push(child(signalRef, `candidates/${this.userId}`), event.candidate.toJSON()).catch(() => {});
    };

    const applyPendingCandidates = async () => {
      if (!pc.remoteDescription || pendingCandidates.length === 0) return;
      const pending = pendingCandidates.splice(0);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
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
      } catch (err) {
        console.warn('Voice: negotiation failed', err);
        this.closePeer(peerId);
        if (isOfferer) this.scheduleRetry(peerId);
      }
    });
    entry.unsubscribers.push(() => off(signalRef, 'value', signalListener));

    const remoteCandidatesRef = child(signalRef, `candidates/${peerId}`);
    const candidateListener = onChildAdded(remoteCandidatesRef, snap => {
      const candidate = snap.val() as RTCIceCandidateInit | null;
      if (!candidate) return;
      if (pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      else pendingCandidates.push(candidate);
    });
    entry.unsubscribers.push(() => off(remoteCandidatesRef, 'child_added', candidateListener));

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId);
        if (isOfferer) this.scheduleRetry(peerId);
      }
    };

    if (isOfferer) {
      await remove(signalRef).catch(() => {});
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await update(signalRef, { offer: { type: offer.type, sdp: offer.sdp }, answer: null, updatedAt: serverTimestamp() });
    }
  }

  private scheduleRetry(peerId: string) {
    if (!this.userId || !this.roomId || this.retryTimers.has(peerId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(peerId);
      if (!this.peers.has(peerId)) this.setupPeer(peerId, this.userId! < peerId).catch(() => {});
    }, 1500);
    this.retryTimers.set(peerId, timer);
  }

  private closePeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.unsubscribers.forEach(unsubscribe => unsubscribe());
    entry.pc.close();
    entry.audio.pause();
    entry.audio.srcObject = null;
    entry.audio.remove();
    this.peers.delete(peerId);
  }

  async stop(roomId?: string, userId?: string) {
    const rid = roomId || this.roomId;
    const uid = userId || this.userId;
    if (rid && uid && isFirebaseConfigured) {
      const removals: Record<string, null> = {};
      removals[`${PEERS_PATH}/${rid}/presence/${uid}`] = null;
      await update(ref(getRtdb()), removals).catch(() => {});
    }
    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();
    [...this.peers.keys()].forEach(peerId => this.closePeer(peerId));
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.roomId = null;
    this.userId = null;
  }
}