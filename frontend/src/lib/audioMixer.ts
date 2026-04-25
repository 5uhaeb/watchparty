'use client';

export type AudioMixerOptions = {
  microphoneStream?: MediaStream | null;
  mediaElement?: HTMLMediaElement | null;
  micVolume?: number;
  mediaVolume?: number;
  voicePriority?: boolean;
  advancedMicProcessing?: boolean;
  onWarning?: (message: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
};

type CapturableMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

const SPEAKING_THRESHOLD = 0.045;
const DUCKED_MEDIA_RATIO = 0.45;
const DUCK_ATTACK_SECONDS = 0.08;
const DUCK_RELEASE_SECONDS = 0.35;

export class WatchPartyAudioMixer {
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private microphoneStream: MediaStream | null;
  private ownsMicrophoneStream = false;
  private mediaElement: HTMLMediaElement | null;
  private mediaStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private mediaGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Float32Array | null = null;
  private micVolume = 1;
  private mediaVolume = 1;
  private voicePriority = false;
  private advancedMicProcessing = false;
  private speaking = false;
  private rafId: number | null = null;
  private readonly onWarning?: (message: string) => void;
  private readonly onSpeakingChange?: (speaking: boolean) => void;

  constructor(options: AudioMixerOptions = {}) {
    this.microphoneStream = options.microphoneStream || null;
    this.mediaElement = options.mediaElement || null;
    this.micVolume = clampVolume(options.micVolume ?? 1);
    this.mediaVolume = clampVolume(options.mediaVolume ?? 1);
    this.voicePriority = !!options.voicePriority;
    this.advancedMicProcessing = !!options.advancedMicProcessing;
    this.onWarning = options.onWarning;
    this.onSpeakingChange = options.onSpeakingChange;
  }

  async start() {
    this.audioContext = new AudioContext();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.micGain = this.audioContext.createGain();
    this.mediaGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyserData = new Float32Array(this.analyser.fftSize);

    if (!this.microphoneStream) {
      this.ownsMicrophoneStream = true;
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: !this.advancedMicProcessing,
          noiseSuppression: !this.advancedMicProcessing,
          autoGainControl: !this.advancedMicProcessing,
        },
      });
    }

    this.connectMicrophone(this.microphoneStream);
    this.attachMediaElement(this.mediaElement);
    this.startVoiceDetection();
    return this.getMixedStream();
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.disconnectMedia();
    safeDisconnect(this.micSource);
    safeDisconnect(this.micGain);
    safeDisconnect(this.analyser);
    const tracksToStop = this.ownsMicrophoneStream
      ? this.microphoneStream?.getTracks()
      : this.microphoneStream?.getAudioTracks();
    tracksToStop?.forEach((track) => track.stop());
    this.destination?.stream.getTracks().forEach((track) => track.stop());
    this.audioContext?.close().catch(() => null);
    this.audioContext = null;
    this.destination = null;
  }

  getMixedStream() {
    return this.destination?.stream || new MediaStream();
  }

  async resume() {
    if (this.audioContext?.state !== 'running') {
      await this.audioContext?.resume().catch(() => null);
    }
  }

  setMicVolume(value: number) {
    this.micVolume = clampVolume(value);
    this.micGain?.gain.setTargetAtTime(this.micVolume, this.audioContext?.currentTime || 0, 0.02);
  }

  setMediaVolume(value: number) {
    this.mediaVolume = clampVolume(value);
    if (this.mediaElement) this.mediaElement.volume = this.mediaVolume;
    this.updateMediaGain();
  }

  setVoicePriority(enabled: boolean) {
    this.voicePriority = enabled;
    this.updateMediaGain();
  }

  setAdvancedMicProcessing(enabled: boolean) {
    this.advancedMicProcessing = enabled;
  }

  setMicEnabled(enabled: boolean) {
    this.microphoneStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  attachMediaElement(element: HTMLMediaElement | null) {
    if (!element || !this.audioContext || !this.destination || !this.mediaGain) return;
    if (element === this.mediaElement && this.mediaSource) return;

    if (element !== this.mediaElement) this.disconnectMedia();
    this.mediaElement = element;
    element.volume = this.mediaVolume;

    const capturable = element as CapturableMediaElement;
    const capture = capturable.captureStream || capturable.mozCaptureStream;
    if (!capture) {
      this.warn('This browser cannot capture movie audio for mixing. Voice call audio will keep working normally.');
      return;
    }

    try {
      const stream = capture.call(capturable);
      if (!stream.getAudioTracks().length) {
        this.warn('Movie audio is not available to the mixer yet. Start playback, then try again if needed.');
        return;
      }

      this.mediaStream = stream;
      this.mediaSource = this.audioContext.createMediaStreamSource(stream);
      this.mediaSource.connect(this.mediaGain).connect(this.destination);
      this.updateMediaGain();
    } catch {
      this.warn('Movie audio could not be captured in this browser. Voice call audio will continue normally.');
    }
  }

  private connectMicrophone(stream: MediaStream) {
    if (!this.audioContext || !this.destination || !this.micGain || !this.analyser) return;
    this.micSource = this.audioContext.createMediaStreamSource(stream);
    // The analyser is a side-chain used for speaking badges and media ducking.
    this.micSource.connect(this.analyser);
    this.micSource.connect(this.micGain).connect(this.destination);
    this.setMicVolume(this.micVolume);
  }

  private startVoiceDetection() {
    if (!this.analyser || !this.analyserData) return;

    const tick = () => {
      if (!this.analyser || !this.analyserData) return;
      this.analyser.getFloatTimeDomainData(this.analyserData);
      let sum = 0;
      for (const sample of this.analyserData) sum += sample * sample;
      const rms = Math.sqrt(sum / this.analyserData.length);
      const nextSpeaking = rms > SPEAKING_THRESHOLD;

      if (nextSpeaking !== this.speaking) {
        this.speaking = nextSpeaking;
        this.onSpeakingChange?.(nextSpeaking);
        this.updateMediaGain();
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private updateMediaGain() {
    if (!this.mediaGain || !this.audioContext) return;
    const target = this.mediaVolume * (this.voicePriority && this.speaking ? DUCKED_MEDIA_RATIO : 1);
    const timeConstant = this.voicePriority && this.speaking ? DUCK_ATTACK_SECONDS : DUCK_RELEASE_SECONDS;
    this.mediaGain.gain.setTargetAtTime(target, this.audioContext.currentTime, timeConstant);
  }

  private disconnectMedia() {
    safeDisconnect(this.mediaSource);
    safeDisconnect(this.mediaGain);
    if (this.audioContext) this.mediaGain = this.audioContext.createGain();
    this.mediaSource = null;
    this.mediaStream = null;
  }

  private warn(message: string) {
    this.onWarning?.(message);
  }
}

export function findWatchMediaElement() {
  return document.querySelector<HTMLMediaElement>('[data-watch-media]');
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function safeDisconnect(node: AudioNode | null) {
  try {
    node?.disconnect();
  } catch {
    // Some browsers throw if a node is already disconnected.
  }
}
