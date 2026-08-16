import {
  ref,
  set,
  update,
  onValue,
  off,
  push,
  child,
  onChildAdded,
  serverTimestamp,
  remove,
} from "firebase/database";
import { getRtdb, isFirebaseConfigured } from "./config";

const PEERS_PATH = "voice_peers";

interface PeerConnection {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  unsubscribers: (() => void)[];
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("__");
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Optional TURN configuration. TURN is important for users behind symmetric
  // NAT/firewalls; credentials stay in runtime environment variables and are
  // never hard-coded into the repository.
  const turnUrl = (import.meta as any).env?.VITE_TURN_URL as string | undefined;
  const turnUsername = (import.meta as any).env?.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = (import.meta as any).env?.VITE_TURN_CREDENTIAL as string | undefined;
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
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
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      return this.localStream;
    } catch (err) {
      console.error("Voice: Error accessing microphone:", err);
      throw err;
    }
  }

  async prime() {
    if (this.isPrimed) return;
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
      this.isPrimed = true;
    } catch (e) {
      console.warn("Voice: Audio priming failed", e);
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol / 100));
    this.peers.forEach((p) => { p.audio.volume = this.volume; });
  }

  async joinRoom(roomId: string, userId: string) {
    if (!isFirebaseConfigured || !this.localStream) return;
    await this.stop();

    this.roomId = roomId;
    this.userId = userId;
    const db = getRtdb();
    const presenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence/${userId}`);

    // Queue disconnect handling before advertising presence, preventing a
    // connection race during mobile/network transitions.
    await presenceRef.onDisconnect().update({ online: false, leftAt: serverTimestamp() }).catch(() => {});
    await set(presenceRef, { online: true, joinedAt: serverTimestamp() });

    const allPresenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence`);
    const onPresence = onValue(allPresenceRef, (snap) => {
      const data = snap.val() || {};
      Object.keys(data).forEach((peerId) => {
        if (peerId === userId || !data[peerId]?.online || this.peers.has(peerId)) return;
        // The lexicographically smaller UID is the stable offerer. Both sides
        // therefore make the same role decision without another server lock.
        this.setupPeer(peerId, userId < peerId).catch((err) => {
          console.warn("Voice: peer setup failed", peerId, err);
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
      pc: new RTCPeerConnection({
        iceServers: iceServers(),
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceCandidatePoolSize: 4,
      }),
      audio: new Audio(),
      unsubscribers: [],
    };
    const pc = peerEntry.pc;
    const audio = peerEntry.audio;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.volume = this.volume;
    audio.style.display = "none";
    document.body.appendChild(audio);
    this.peers.set(peerId, peerEntry);

    this.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      audio.srcObject = stream;
      audio.play().catch(() => {
        const resume = () => {
          audio.play().catch(() => {});
          document.removeEventListener("pointerdown", resume);
          document.removeEventListener("touchstart", resume);
        };
        document.addEventListener("pointerdown", resume, { once: true, passive: true });
        document.addEventListener("touchstart", resume, { once: true, passive: true });
      });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.userId) return;
      const candidatesRef = child(signalRef, `candidates/${this.userId}`);
      push(candidatesRef, event.candidate.toJSON()).catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "failed" || state === "closed") {
        this.closePeer(peerId);
      }
    };

    // Each peer watches the shared pair record. This fixes the old signaling
    // path mismatch where the callee wrote the answer under a path the offerer
    // was not listening to.
    const signalListener = onValue(signalRef, async (snap) => {
      const signal = snap.val() || {};
      try {
        if (!isOfferer && signal.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await update(signalRef, {
            answer: { type: answer.type, sdp: answer.sdp },
            updatedAt: serverTimestamp(),
          });
        } else if (isOfferer && signal.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        }
      } catch (err) {
        console.warn("Voice: signaling negotiation failed", err);
      }
    });
    peerEntry.unsubscribers.push(() => off(signalRef, "value", signalListener));

    const remoteCandidatesRef = child(signalRef, `candidates/${peerId}`);
    const candidateListener = onChildAdded(remoteCandidatesRef, (snap) => {
      const candidate = snap.val();
      if (candidate && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    });
    peerEntry.unsubscribers.push(() => off(remoteCandidatesRef, "child_added", candidateListener));

    if (isOfferer) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await update(signalRef, {
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        updatedAt: serverTimestamp(),
      });
    }
  }

  private closePeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.unsubscribers.forEach((u) => u());
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
      const db = getRtdb();
      await remove(ref(db, `${PEERS_PATH}/${rid}/presence/${uid}`)).catch(() => {});
      await remove(ref(db, `${PEERS_PATH}/${rid}/signals/${pairKey(uid, uid)}`)).catch(() => {});
    }

    this.peers.forEach((_, peerId) => this.closePeer(peerId));
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.roomId = null;
    this.userId = null;
  }
}