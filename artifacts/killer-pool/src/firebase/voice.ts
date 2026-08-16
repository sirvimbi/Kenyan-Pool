import {
  ref, set, update, onValue, push, child, onChildAdded,
  serverTimestamp, remove, onDisconnect
} from 'firebase/database';
import { getRtdb, isFirebaseConfigured } from './config';

const PEERS_PATH = 'voice_peers';

interface PeerConnection {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  gain?: GainNode;
  source?: MediaStreamAudioSourceNode;
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
  private audioContext: AudioContext | null = null;
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private async ensureAudioContext(): Promise<AudioContext | null> {
    try {
      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return null;
      if (!this.audioContext) this.audioContext = new AudioContextCtor();
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') await ctx.resume();
      return ctx;
    } catch (err) {
      console.warn('Voice: AudioContext unavailable', err);
      return null;
    }
  }

  async startLocalStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Voice chat requires a secure browser with microphone support.');
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.localStream.getAudioTracks().forEach(track => { track.enabled = true; });
      return this.localStream;
    } catch (err) {
      console.error('Voice: microphone access failed:', err);
      throw err;
    }
  }

  async prime() {
    if (this.isPrimed) {
      await this.ensureAudioContext();
      return;
    }
    try {
      const ctx = await this.ensureAudioContext();
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
      this.isPrimed = true;
    } catch (err) {
      console.warn('Voice: audio priming failed', err);
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol / 100));
    const ctx = this.audioContext;
    this.peers.forEach(peer => {
      peer.audio.volume = this.volume;
      if (peer.gain && ctx) {
        const audioContext = ctx;
        peer.gain.gain.setTargetAtTime(this.volume, audioContext.currentTime, 0.01);
      }
    });
  }

  async joinRoom(roomId: string, userId: string) {
    if (!isFirebaseConfigured || !this.localStream) return;
    await this.stop();
    this.roomId = roomId;
    this.userId = userId;
    await this.ensureAudioContext();

    const db = getRtdb();
    const presenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence/${userId}`);
    await onDisconnect(presenceRef).update({ online: false, leftAt: serverTimestamp() }).catch(() => {});
    await set(presenceRef, { online: true, joinedAt: serverTimestamp() });

    const allPresenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence`);
    const presenceUnsub = onValue(allPresenceRef, snap => {
      const data = snap.val() || {};
      Object.keys(data).forEach(peerId => {
        if (peerId === userId || !data[peerId]?.online || this.peers.has(peerId)) return;
        if (userId < peerId) {
          this.setupPeer(peerId, true).catch(err => console.warn('Voice: offer setup failed', err));
        }
      });
    });
    this.unsubscribers.push(presenceUnsub);

    const incomingSignalsRef = ref(db, `${PEERS_PATH}/${roomId}/signals/${userId}`);
    const incomingUnsub = onChildAdded(incomingSignalsRef, snap => {
      const peerId = snap.key;
      const signal = snap.val();
      if (!peerId || !signal?.offer || this.peers.has(peerId)) return;
      this.setupPeer(peerId, false, signal.offer).catch(err => console.warn('Voice: answer setup failed', err));
    });
    this.unsubscribers.push(incomingUnsub);
  }

  private async setupPeer(peerId: string, isOfferer: boolean, remoteOffer?: RTCSessionDescriptionInit) {
    if (!this.roomId || !this.userId || this.peers.has(peerId)) return;
    const db = getRtdb();
    const signalPath = `${PEERS_PATH}/${this.roomId}/signals/${isOfferer ? peerId : this.userId}/${isOfferer ? this.userId : peerId}`;
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
    audio.controls = false;
    audio.muted = false;
    audio.volume = this.volume;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    const entry: PeerConnection = { pc, audio, unsubscribers: [] };
    this.peers.set(peerId, entry);

    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.ontrack = async event => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      audio.srcObject = stream;
      const ctx = await this.ensureAudioContext();
      if (!ctx) {
        audio.play().catch(() => {});
        return;
      }
      const audioContext = ctx;
      if (!entry.source) {
        try {
          entry.source = audioContext.createMediaStreamSource(stream);
          entry.gain = audioContext.createGain();
          entry.gain.gain.value = this.volume;
          entry.source.connect(entry.gain).connect(audioContext.destination);
        } catch (err) {
          console.warn('Voice: WebAudio routing failed; using HTMLAudio fallback', err);
        }
      }
      audio.play().catch(() => {
        const resume = async () => {
          await this.ensureAudioContext().catch(() => null);
          audio.play().catch(() => {});
        };
        document.addEventListener('pointerdown', resume, { once: true, passive: true });
        document.addEventListener('touchstart', resume, { once: true, passive: true });
      });
    };

    pc.onicecandidate = event => {
      if (!event.candidate || !this.userId) return;
      push(child(signalRef, `candidates/${this.userId}`), event.candidate.toJSON()).catch(err => console.warn('Voice: ICE publish failed', err));
    };

    const applyPendingCandidates = async () => {
      if (!pc.remoteDescription || pendingCandidates.length === 0) return;
      const pending = pendingCandidates.splice(0);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.warn('Voice: queued ICE rejected', err));
      }
    };

    if (!isOfferer && remoteOffer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
      await applyPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await update(signalRef, { answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
    }

    const signalUnsub = onValue(signalRef, async snap => {
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
    entry.unsubscribers.push(signalUnsub);

    const remoteCandidatesRef = child(signalRef, `candidates/${peerId}`);
    const candidateUnsub = onChildAdded(remoteCandidatesRef, snap => {
      const candidate = snap.val() as RTCIceCandidateInit | null;
      if (!candidate) return;
      if (pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.warn('Voice: ICE rejected', err));
      } else {
        pendingCandidates.push(candidate);
      }
    });
    entry.unsubscribers.push(candidateUnsub);

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn('Voice: ICE connection failed', peerId);
        this.closePeer(peerId);
        if (isOfferer) this.scheduleRetry(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Voice: peer connection', peerId, pc.connectionState);
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
      if (!this.peers.has(peerId)) this.setupPeer(peerId, this.userId! < peerId).catch(err => console.warn('Voice: retry failed', err));
    }, 1500);
    this.retryTimers.set(peerId, timer);
  }

  private closePeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.unsubscribers.forEach(unsubscribe => { try { unsubscribe(); } catch {} });
    try { entry.source?.disconnect(); } catch {}
    try { entry.gain?.disconnect(); } catch {}
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
    this.unsubscribers.forEach(unsubscribe => { try { unsubscribe(); } catch {} });
    this.unsubscribers = [];
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.roomId = null;
    this.userId = null;
    this.isPrimed = false;
  }
}