'use client';

import { ICE_SERVERS } from '@/lib/iceServers';

type JanusReply = {
  janus: string;
  transaction?: string;
  session_id?: number;
  sender?: number;
  data?: any;
  plugindata?: { plugin: string; data: any };
  jsep?: RTCSessionDescriptionInit;
  error?: { code?: number; reason?: string };
};

type BridgeHandle = {
  id: number;
  pc?: RTCPeerConnection;
  stream?: MediaStream;
  audioContext?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
};

type JanusAudioBridgeOptions = {
  roomId: string;
  displayName: string;
  userId: string;
  wsUrl?: string;
  onMixedStream?: (stream: MediaStream) => void;
  onWarning?: (message: string) => void;
  onStatus?: (message: string) => void;
  onDisconnect?: () => void;
};

const AUDIOBRIDGE_PLUGIN = 'janus.plugin.audiobridge';
const OPUS_BITRATE = 256000;
const PRODUCTION_AUDIO_SERVER_WS_URL = 'wss://watchparty-janus-audio.onrender.com';

export function getAudioServerWsUrl() {
  const configuredUrl = (
    process.env.NEXT_PUBLIC_AUDIO_SERVER_WS_URL ||
    process.env.VITE_AUDIO_SERVER_WS_URL ||
    ''
  );

  if (typeof window === 'undefined') return configuredUrl;

  const appIsLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const localJanusUrl = 'ws://localhost:8188';
  const sameOriginUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  if (!configuredUrl) return appIsLocal ? localJanusUrl : PRODUCTION_AUDIO_SERVER_WS_URL;

  try {
    const parsed = new URL(configuredUrl, window.location.href);
    const targetIsLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);

    if (!appIsLocal && targetIsLocal) return sameOriginUrl;
    if (parsed.hostname.includes('janus') && parsed.pathname === '/janus') parsed.pathname = '/';
    if (parsed.protocol === 'http:') return parsed.href.replace(/^http:/, 'ws:');
    if (parsed.protocol === 'https:') return parsed.href.replace(/^https:/, 'wss:');
  } catch {
    return appIsLocal ? localJanusUrl : PRODUCTION_AUDIO_SERVER_WS_URL;
  }

  return configuredUrl;
}

export function roomCodeToJanusRoomId(roomCode: string) {
  let hash = 2166136261;
  for (const char of roomCode.toUpperCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 100000 + (Math.abs(hash) % 900000000);
}

export class JanusAudioBridgeClient {
  private ws: WebSocket | null = null;
  private sessionId: number | null = null;
  private keepAliveId: number | null = null;
  private transactions = new Map<string, { resolve: (value: JanusReply) => void; reject: (error: Error) => void }>();
  private joinWaiters = new Map<number, () => void>();
  private micHandle: BridgeHandle | null = null;
  private mediaHandle: BridgeHandle | null = null;
  private connected = false;
  private roomNumber: number;
  private readonly wsUrl: string;
  private readonly displayName: string;
  private readonly userId: string;
  private readonly onMixedStream?: (stream: MediaStream) => void;
  private readonly onWarning?: (message: string) => void;
  private readonly onStatus?: (message: string) => void;
  private readonly onDisconnect?: () => void;

  constructor(options: JanusAudioBridgeOptions) {
    this.wsUrl = options.wsUrl || getAudioServerWsUrl();
    this.roomNumber = roomCodeToJanusRoomId(options.roomId);
    this.displayName = options.displayName;
    this.userId = options.userId;
    this.onMixedStream = options.onMixedStream;
    this.onWarning = options.onWarning;
    this.onStatus = options.onStatus;
    this.onDisconnect = options.onDisconnect;
  }

  async connect(microphoneStream: MediaStream) {
    if (!this.wsUrl) {
      this.warn('Room audio server is not configured. Set NEXT_PUBLIC_AUDIO_SERVER_WS_URL to your Janus WebSocket URL.');
      return;
    }

    this.ws = await this.openSocket(this.wsUrl);
    const create = await this.request({ janus: 'create' });
    this.sessionId = create.data?.id;
    if (!this.sessionId) throw new Error('Janus did not return a session id.');

    this.connected = true;
    this.keepAliveId = window.setInterval(() => {
      this.request({ janus: 'keepalive', session_id: this.sessionId }).catch(() => null);
    }, 25000);

    this.micHandle = await this.attach();
    await this.ensureRoom(this.micHandle);
    await this.joinAndPublish(this.micHandle, microphoneStream, {
      display: `${this.displayName} mic`,
      direction: 'sendrecv',
      muted: false,
    });
    this.status('Connected to room audio server.');
  }

  async publishMediaAudio(mediaStream: MediaStream) {
    if (!this.connected || !mediaStream.getAudioTracks().length) return false;

    await this.unpublishMediaAudio();
    this.mediaHandle = await this.attach();
    await this.joinAndPublish(this.mediaHandle, mediaStream, {
      display: `${this.displayName} media-bot`,
      direction: 'sendonly',
      muted: false,
    });
    this.status('Watch player audio is publishing to the room mixer.');
    return true;
  }

  async unpublishMediaAudio() {
    if (!this.mediaHandle) return;
    await this.detachHandle(this.mediaHandle);
    this.mediaHandle = null;
  }

  setMicVolume(value: number) {
    if (this.micHandle?.gain && this.micHandle.audioContext) {
      this.micHandle.gain.gain.setTargetAtTime(clampVolume(value), this.micHandle.audioContext.currentTime, 0.02);
    }
  }

  setMediaVolume(value: number) {
    if (this.mediaHandle?.gain && this.mediaHandle.audioContext) {
      this.mediaHandle.gain.gain.setTargetAtTime(clampVolume(value), this.mediaHandle.audioContext.currentTime, 0.02);
    }
  }

  setMicEnabled(enabled: boolean) {
    this.micHandle?.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async resume() {
    await Promise.allSettled([
      this.micHandle?.audioContext?.resume(),
      this.mediaHandle?.audioContext?.resume(),
    ]);
  }

  async disconnect() {
    this.connected = false;
    if (this.keepAliveId !== null) window.clearInterval(this.keepAliveId);
    this.keepAliveId = null;

    await Promise.allSettled([
      this.mediaHandle ? this.detachHandle(this.mediaHandle) : Promise.resolve(),
      this.micHandle ? this.detachHandle(this.micHandle) : Promise.resolve(),
    ]);
    this.mediaHandle = null;
    this.micHandle = null;

    if (this.sessionId) {
      await this.request({ janus: 'destroy', session_id: this.sessionId }).catch(() => null);
    }
    this.sessionId = null;
    this.ws?.close();
    this.ws = null;
    for (const pending of this.transactions.values()) pending.reject(new Error('Janus connection closed.'));
    this.transactions.clear();
  }

  private async openSocket(url: string) {
    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(normalizeJanusWebSocketUrl(url), 'janus-protocol');
      const timer = window.setTimeout(() => reject(new Error('Janus WebSocket connection timed out.')), 10000);

      ws.onopen = () => {
        window.clearTimeout(timer);
        ws.onmessage = (event) => this.handleMessage(event);
        ws.onerror = () => this.warn('Room audio WebSocket reported an error.');
        ws.onclose = () => {
          this.connected = false;
          this.status('Room audio server disconnected.');
          this.onDisconnect?.();
        };
        resolve(ws);
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Could not connect to the Janus room audio server.'));
      };
    });
  }

  private async attach(): Promise<BridgeHandle> {
    const response = await this.request({
      janus: 'attach',
      session_id: this.sessionId,
      plugin: AUDIOBRIDGE_PLUGIN,
    });
    const handleId = response.data?.id;
    if (!handleId) throw new Error('Janus did not attach AudioBridge.');
    return { id: handleId };
  }

  private async ensureRoom(handle: BridgeHandle) {
    await this.message(handle, {
      request: 'create',
      room: this.roomNumber,
      description: `WatchParty ${this.roomNumber}`,
      permanent: false,
      sampling_rate: 48000,
      audiocodec: 'opus',
      bitrate: OPUS_BITRATE,
      record: false,
      audiolevel_ext: true,
      audiolevel_event: true,
      audio_active_packets: 50,
      default_prebuffering: 6,
    }).catch(() => null);
  }

  private async joinAndPublish(
    handle: BridgeHandle,
    inputStream: MediaStream,
    options: { display: string; direction: RTCRtpTransceiverDirection; muted: boolean }
  ) {
    const stream = await this.createGainControlledAudioStream(inputStream, options.direction === 'sendrecv' ? 1 : 1);
    handle.stream = stream;

    await this.waitForJoin(handle, () =>
      this.message(handle, {
        request: 'join',
        room: this.roomNumber,
        display: options.display,
        id: this.numericParticipantId(`${this.userId}:${options.display}`),
        muted: options.muted,
      })
    );

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    handle.pc = pc;
    pc.onicecandidate = (event) => {
      this.trickle(handle, event.candidate).catch(() => null);
    };
    pc.ontrack = (event) => {
      if (options.direction === 'sendrecv') {
        this.onMixedStream?.(event.streams[0] || new MediaStream([event.track]));
      }
    };

    const track = stream.getAudioTracks()[0];
    const transceiver = pc.addTransceiver(track, {
      direction: options.direction,
      streams: [stream],
    });
    preferOpus(transceiver);

    const offer = await pc.createOffer({
      offerToReceiveAudio: options.direction === 'sendrecv',
      offerToReceiveVideo: false,
    });
    offer.sdp = enhanceOpusSdp(offer.sdp || '');
    await pc.setLocalDescription(offer);

    const configure = await this.message(handle, {
      request: 'configure',
      muted: options.muted,
      quality: 10,
      bitrate: OPUS_BITRATE,
    }, pc.localDescription || offer);

    if (configure.jsep) {
      await pc.setRemoteDescription(new RTCSessionDescription(configure.jsep));
    }

    const sender = pc.getSenders().find((item) => item.track?.kind === 'audio');
    const params = sender?.getParameters();
    if (sender && params) {
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = OPUS_BITRATE;
      await sender.setParameters(params).catch(() => null);
    }
  }

  private async createGainControlledAudioStream(inputStream: MediaStream, volume: number) {
    const context = new AudioContext({ sampleRate: 48000 });
    const source = context.createMediaStreamSource(inputStream);
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    gain.gain.value = clampVolume(volume);
    source.connect(gain).connect(destination);

    const output = destination.stream;
    const handle = this.mediaHandle && !this.mediaHandle.stream ? this.mediaHandle : this.micHandle;
    if (handle) {
      handle.audioContext = context;
      handle.source = source;
      handle.gain = gain;
    }

    return output;
  }

  private async waitForJoin(handle: BridgeHandle, sendJoin: () => Promise<JanusReply>) {
    const joined = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.joinWaiters.delete(handle.id);
        reject(new Error('Timed out joining Janus AudioBridge room.'));
      }, 10000);
      this.joinWaiters.set(handle.id, () => {
        window.clearTimeout(timer);
        resolve();
      });
    });
    await sendJoin();
    await joined;
  }

  private async message(handle: BridgeHandle, body: Record<string, any>, jsep?: RTCSessionDescriptionInit) {
    return this.request({
      janus: 'message',
      session_id: this.sessionId,
      handle_id: handle.id,
      body,
      ...(jsep ? { jsep } : {}),
    });
  }

  private async trickle(handle: BridgeHandle, candidate: RTCIceCandidate | null) {
    return this.request({
      janus: 'trickle',
      session_id: this.sessionId,
      handle_id: handle.id,
      candidate: candidate || { completed: true },
    });
  }

  private async detachHandle(handle: BridgeHandle) {
    handle.pc?.close();
    handle.stream?.getTracks().forEach((track) => track.stop());
    safeDisconnect(handle.source);
    safeDisconnect(handle.gain);
    await handle.audioContext?.close().catch(() => null);
    if (this.sessionId) {
      await this.request({
        janus: 'detach',
        session_id: this.sessionId,
        handle_id: handle.id,
      }).catch(() => null);
    }
  }

  private request(payload: Record<string, any>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Janus WebSocket is not connected.'));
    }

    const transaction = randomId();
    const message = { ...payload, transaction };
    return new Promise<JanusReply>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.transactions.delete(transaction);
        reject(new Error('Janus request timed out.'));
      }, 12000);
      this.transactions.set(transaction, {
        resolve: (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      });
      this.ws?.send(JSON.stringify(message));
    });
  }

  private handleMessage(event: MessageEvent) {
    const message = JSON.parse(event.data) as JanusReply;
    if (message.transaction && this.transactions.has(message.transaction)) {
      const pending = this.transactions.get(message.transaction)!;
      if (message.janus === 'error') pending.reject(new Error(message.error?.reason || 'Janus request failed.'));
      else pending.resolve(message);
      this.transactions.delete(message.transaction);
    }

    if (message.sender && message.plugindata?.data) {
      const pluginEvent = message.plugindata.data;
      if (pluginEvent.audiobridge === 'joined' || pluginEvent.result === 'joined') {
        this.joinWaiters.get(message.sender)?.();
        this.joinWaiters.delete(message.sender);
      }
      if (message.jsep) {
        const handle = [this.micHandle, this.mediaHandle].find((candidate) => candidate?.id === message.sender);
        handle?.pc?.setRemoteDescription(new RTCSessionDescription(message.jsep)).catch(() => null);
      }
      if (pluginEvent.error) this.warn(pluginEvent.error);
    }
  }

  private numericParticipantId(seed: string) {
    let hash = 0;
    for (const char of seed) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
    return 10000 + (Math.abs(hash) % 2000000000);
  }

  private warn(message: string) {
    this.onWarning?.(message);
  }

  private status(message: string) {
    this.onStatus?.(message);
  }
}

function preferOpus(transceiver: RTCRtpTransceiver) {
  const capabilities = RTCRtpSender.getCapabilities?.('audio');
  const codecs = capabilities?.codecs;
  if (!codecs?.length || !transceiver.setCodecPreferences) return;
  const opus = codecs.filter((codec) => codec.mimeType.toLowerCase() === 'audio/opus');
  const rest = codecs.filter((codec) => codec.mimeType.toLowerCase() !== 'audio/opus');
  if (opus.length) transceiver.setCodecPreferences([...opus, ...rest]);
}

function enhanceOpusSdp(sdp: string) {
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!opusMatch) return sdp;
  const payload = opusMatch[1];
  const params = `a=fmtp:${payload} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=${OPUS_BITRATE};usedtx=0`;
  if (sdp.includes(`a=fmtp:${payload}`)) {
    return sdp.replace(new RegExp(`a=fmtp:${payload}.*`, 'i'), params);
  }
  return sdp.replace(new RegExp(`(a=rtpmap:${payload} opus/48000/2\\r?\\n)`, 'i'), `$1${params}\r\n`);
}

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeJanusWebSocketUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
    if (parsed.hostname.includes('janus') && parsed.pathname === '/janus') parsed.pathname = '/';
    return parsed.href;
  } catch {
    return rawUrl;
  }
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function safeDisconnect(node?: AudioNode | null) {
  try {
    node?.disconnect();
  } catch {
    // Already disconnected.
  }
}
