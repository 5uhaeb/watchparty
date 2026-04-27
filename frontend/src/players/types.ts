'use client';

export type PlayerState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued' | 'unknown';

export interface PlayerAdapter {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setPlaybackRate?: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getState: () => PlayerState;
}

export type PlayerEventHandlers = {
  onReady?: () => void;
  onStateChange?: (state: PlayerState) => void;
  onError?: (error: unknown) => void;
};
