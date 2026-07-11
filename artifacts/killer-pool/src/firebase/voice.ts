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
}

export class VoiceManager {
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerConnection>();
  private unsubscribers: (() => void)[] = [];
  private volume = 1;
  private roomId: string | null = null;
  private userId: string | null = null;
  private isPrimed = false;

  constructor() {}

  async startLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
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
        if (ctx.state === 'suspended') await ctx.resume();
        // Play a silent oscillator to fully unlock the audio system
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
        console.log("Voice: Audio system primed for mobile");
      }
      this.isPrimed = true;
    } catch (e) {
      console.warn("Voice: Audio priming failed", e);
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol / 100));
    this.peers.forEach(p => {
      p.audio.volume = this.volume;
    });
  }

  async joinRoom(roomId: string, userId: string) {
    if (!isFirebaseConfigured || !this.localStream) return;
    this.roomId = roomId;
    this.userId = userId;
    const db = getRtdb();

    console.log(`Voice: Joining room ${roomId} as ${userId}`);

    const presenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence/${userId}`);
    await set(presenceRef, { joinedAt: serverTimestamp() });

    const allPresenceRef = ref(db, `${PEERS_PATH}/${roomId}/presence`);
    const onPresence = onValue(allPresenceRef, (snap) => {
      const data = snap.val() || {};
      Object.keys(data).forEach(peerId => {
        if (peerId !== userId && !this.peers.has(peerId)) {
          if (userId < peerId) {
            this.setupPeer(peerId, true);
          }
        }
      });
    });
    this.unsubscribers.push(() => off(allPresenceRef, 'value', onPresence));

    const mySignalsRef = ref(db, `${PEERS_PATH}/${roomId}/signals/${userId}`);
    const onIncomingSignal = onChildAdded(mySignalsRef, (snap) => {
      const fromId = snap.key;
      const signalData = snap.val();
      if (fromId && signalData.offer && !this.peers.has(fromId)) {
        this.setupPeer(fromId, false, signalData.offer);
      }
    });
    this.unsubscribers.push(() => off(mySignalsRef, 'child_added', onIncomingSignal));
  }

  private async setupPeer(peerId: string, isOfferer: boolean, remoteOffer?: any) {
    if (this.peers.has(peerId)) return;
    console.log(`Voice: Connecting to ${peerId} (Offerer: ${isOfferer})`);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
    });

    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = this.volume;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    this.peers.set(peerId, { pc, audio });

    this.localStream?.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream!);
    });

    pc.ontrack = (event) => {
      console.log(`Voice: Received track from ${peerId}`);
      if (audio.srcObject !== event.streams[0]) {
        audio.srcObject = event.streams[0];
        audio.play().catch(e => {
          console.warn("Voice: Autoplay prevented, adding fallback tap listener", e);
          const fix = () => {
            audio.play().then(() => {
              console.log("Voice: Audio fixed via tap");
              document.removeEventListener('click', fix);
            }).catch(() => {});
          };
          document.addEventListener('click', fix);
        });
      }
    };

    const db = getRtdb();
    const signalPath = isOfferer
      ? `${PEERS_PATH}/${this.roomId}/signals/${peerId}/${this.userId}`
      : `${PEERS_PATH}/${this.roomId}/signals/${this.userId}/${peerId}`;
    const signalRef = ref(db, signalPath);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidatesRef = child(signalRef, `candidates/${this.userId}`);
        push(candidatesRef, event.candidate.toJSON());
      }
    };

    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await update(signalRef, { offer: { type: offer.type, sdp: offer.sdp } });

      const answerRef = child(signalRef, 'answer');
      const onAnswer = onValue(answerRef, async (snap) => {
        const answer = snap.val();
        if (answer && !pc.currentRemoteDescription) {
          console.log(`Voice: Received answer from ${peerId}`);
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });
      this.unsubscribers.push(() => off(answerRef, 'value', onAnswer));
    } else {
      console.log(`Voice: Processing offer from ${peerId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await update(signalRef, { answer: { type: answer.type, sdp: answer.sdp } });
    }

    const peerCandidatesRef = child(signalRef, `candidates/${peerId}`);
    const onPeerCandidate = onChildAdded(peerCandidatesRef, (snap) => {
      const candidate = snap.val();
      if (candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    });
    this.unsubscribers.push(() => off(peerCandidatesRef, 'child_added', onPeerCandidate));
  }

  async stop(roomId?: string, userId?: string) {
    const rid = roomId || this.roomId;
    const uid = userId || this.userId;

    console.log(`Voice: Stopping session for ${uid}`);

    if (rid && uid) {
      const db = getRtdb();
      try {
        await remove(ref(db, `${PEERS_PATH}/${rid}/presence/${uid}`));
        await remove(ref(db, `${PEERS_PATH}/${rid}/signals/${uid}`));
      } catch (e) {}
    }

    this.peers.forEach(p => {
      p.pc.close();
      p.audio.pause();
      p.audio.srcObject = null;
      p.audio.remove();
    });
    this.peers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }
}
