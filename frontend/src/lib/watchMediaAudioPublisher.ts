'use client';

export type CapturableMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export type WatchMediaCaptureResult =
  | { ok: true; stream: MediaStream; sourceElement: HTMLMediaElement }
  | { ok: false; reason: string };

export function findWatchMediaElement() {
  return document.querySelector<HTMLMediaElement>('[data-watch-media]');
}

export function captureWatchMediaAudio(
  elementOrRef?: HTMLMediaElement | null | { current: HTMLMediaElement | null }
): WatchMediaCaptureResult {
  let element: HTMLMediaElement | null = null;
  if (isMediaElementRef(elementOrRef)) {
    element = elementOrRef.current;
  } else {
    element = (elementOrRef as HTMLMediaElement | null | undefined) || findWatchMediaElement();
  }

  if (!element) {
    return { ok: false, reason: 'No watch player media element is available for room audio yet.' };
  }

  const capturable = element as CapturableMediaElement;
  const capture = capturable.captureStream || capturable.mozCaptureStream;
  if (!capture) {
    return {
      ok: false,
      reason: 'This browser cannot capture watch player audio. Microphone room audio will still work.',
    };
  }

  try {
    const capturedStream = capture.call(capturable);
    const audioTracks = capturedStream.getAudioTracks();
    if (!audioTracks.length) {
      return {
        ok: false,
        reason: 'Watch player audio is not capturable yet. Start playback, then try again if needed.',
      };
    }

    return {
      ok: true,
      stream: new MediaStream(audioTracks),
      sourceElement: element,
    };
  } catch {
    return {
      ok: false,
      reason: 'Watch player audio could not be captured in this browser. Microphone room audio will continue.',
    };
  }
}

function isMediaElementRef(
  value: HTMLMediaElement | null | { current: HTMLMediaElement | null } | undefined
): value is { current: HTMLMediaElement | null } {
  return !!value && !(value instanceof HTMLMediaElement) && 'current' in value;
}
