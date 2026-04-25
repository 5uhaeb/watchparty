(() => {
  const DEFAULT_RATE = 1;
  const HEARTBEAT_MS = 4000;
  const SEEK_DRIFT_SEC = 1.5;
  const RATE_DRIFT_SEC = 0.35;

  function hashText(value) {
    let hash = 5381;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 33) ^ text.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }

  function isVisible(video) {
    const rect = video.getBoundingClientRect?.();
    return !!rect && rect.width >= 160 && rect.height >= 90;
  }

  function hasUsefulDuration(video) {
    return Number.isFinite(video.duration) && video.duration > 5;
  }

  function scoreVideo(video, previous) {
    let score = 0;
    if (video === previous) score += 12;
    if (hasUsefulDuration(video)) score += 20;
    if (isVisible(video)) score += 20;
    if (!video.paused) score += 18;
    if (video.currentTime > 1) score += 8;
    if (!video.muted) score += 4;
    if (video.readyState >= 2) score += 8;

    const rect = video.getBoundingClientRect?.();
    if (rect) score += Math.min(20, Math.round((rect.width * rect.height) / 25000));
    return score;
  }

  function collectVideos(root, videos = []) {
    const directVideos = root.querySelectorAll?.('video') || [];
    directVideos.forEach((video) => videos.push(video));

    const elements = root.querySelectorAll?.('*') || [];
    elements.forEach((element) => {
      if (element.shadowRoot) collectVideos(element.shadowRoot, videos);
    });

    return videos;
  }

  function defaultFindVideo(previous) {
    const videos = collectVideos(document).filter((video) => !video.disablePictureInPicture || isVisible(video));
    if (!videos.length) return null;

    return videos
      .map((video) => ({ video, score: scoreVideo(video, previous) }))
      .sort((a, b) => b.score - a.score)[0].video;
  }

  function safeTitle() {
    return document.title?.slice(0, 120) || '';
  }

  function makeMetadata(provider, video) {
    return {
      provider,
      sourceType: 'ott-sync',
      tabUrlHash: hashText(location.origin + location.pathname),
      title: safeTitle(),
      pageUrl: location.origin + location.pathname,
      currentTime: video?.currentTime || 0,
      paused: !!video?.paused,
      playbackRate: video?.playbackRate || DEFAULT_RATE,
    };
  }

  function createAdapter(config) {
    const provider = config.provider;
    const findProviderVideo = config.findVideo || defaultFindVideo;
    let video = null;
    let observer = null;
    let ignoreUntil = 0;
    let lastSeekSentAt = 0;
    let lastPositionSample = { at: 0, time: 0 };
    let heartbeatTimer = null;
    let controlAllowed = false;
    let connected = false;
    let roomCode = '';

    function now() {
      return Date.now();
    }

    function isIgnoring() {
      return now() < ignoreUntil;
    }

    function withIgnore(action, releaseAfterMs = 800) {
      ignoreUntil = now() + releaseAfterMs;
      action();
    }

    function send(eventName, positionSec) {
      if (!window.WatchPartyOttMath?.shouldSendLocalEvent({
        hasVideo: !!video,
        controlAllowed,
        ignoreUntilMs: ignoreUntil,
        nowMs: now(),
      })) return;
      chrome.runtime.sendMessage({
        type: 'watchparty:local-player-event',
        eventName,
        positionSec,
        ...makeMetadata(provider, video),
      }).catch(() => {});
    }

    function sendStatus(message) {
      chrome.runtime.sendMessage({
        type: 'watchparty:content-status',
        provider,
        hasVideo: !!video,
        message,
        ...makeMetadata(provider, video),
      }).catch(() => {});
    }

    function onPlay() {
      send('player:play', video?.currentTime || 0);
      startHeartbeat();
    }

    function onPause() {
      stopHeartbeat();
      send('player:pause', video?.currentTime || 0);
    }

    function onSeeked() {
      if (!video || isIgnoring()) return;
      const elapsed = now() - lastSeekSentAt;
      if (elapsed < 1000) return;
      lastSeekSentAt = now();
      send('player:seek', video.currentTime || 0);
    }

    function detach() {
      if (!video) return;
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video = null;
      stopHeartbeat();
    }

    function attach(nextVideo) {
      if (!nextVideo || nextVideo === video) return;
      detach();
      video = nextVideo;
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('seeked', onSeeked);
      lastPositionSample = { at: now(), time: video.currentTime || 0 };
      sendStatus('Video detected.');
      if (!video.paused) startHeartbeat();
    }

    function refreshVideo() {
      const nextVideo = findProviderVideo(video) || defaultFindVideo(video);
      if (nextVideo) attach(nextVideo);
      return !!nextVideo;
    }

    function canSafelySetTime(target) {
      if (!video) return false;
      if (video.readyState < 1) return false;
      if (Number.isFinite(video.duration) && target > video.duration + 2) return false;
      return true;
    }

    function setPlaybackRate(rate) {
      if (!video || video.paused) return;
      video.playbackRate = rate;
      window.clearTimeout(video.dataset.watchpartyRateTimer || 0);
      const timerId = window.setTimeout(() => {
        if (video) video.playbackRate = DEFAULT_RATE;
      }, 2500);
      video.dataset.watchpartyRateTimer = String(timerId);
    }

    function correctDrift(targetPosition) {
      if (!video || !canSafelySetTime(targetPosition)) return;
      const decision = window.WatchPartyOttMath?.decideDriftAction(
        video.currentTime,
        targetPosition,
        !video.paused,
        video.readyState
      );

      if (!decision || decision.action === 'none') {
        if (video.playbackRate !== DEFAULT_RATE) video.playbackRate = DEFAULT_RATE;
        return;
      }

      if (decision.action === 'rate') {
        setPlaybackRate(decision.rate);
        return;
      }

      video.currentTime = decision.positionSec;
    }

    function applyRemote(eventName, payload = {}) {
      if (!video) refreshVideo();
      if (!video) {
        sendStatus('No video detected on this tab.');
        return;
      }

      if (payload.sourceType && payload.sourceType !== 'ott-sync') return;
      if (payload.provider && payload.provider !== provider && payload.provider !== 'ott') return;
      if (payload.roomCode && roomCode && payload.roomCode !== roomCode) return;

      const basePosition = Number(payload.positionSec || payload.currentTime || 0);
      if (!Number.isFinite(basePosition) || basePosition < 0) return;

      const serverLatencySec = payload.atServerTs ? Math.max(0, (now() - payload.atServerTs) / 1000) : 0;
      const shouldAdvance = eventName === 'player:play' || (eventName === 'player:heartbeat' && !video.paused);
      const targetPosition = basePosition + (shouldAdvance ? serverLatencySec : 0);

      withIgnore(() => {
        if (eventName === 'player:seek' || eventName === 'player:pause') {
          if (canSafelySetTime(basePosition)) video.currentTime = basePosition;
        } else {
          correctDrift(targetPosition);
        }

        if (eventName === 'player:play' && video.readyState >= 2) {
          video.play().catch(() => {});
        }

        if (eventName === 'player:pause') {
          video.pause();
        }
      }, 1000);
    }

    function heartbeat() {
      if (video?.paused || !window.WatchPartyOttMath?.shouldSendLocalEvent({
        hasVideo: !!video,
        controlAllowed,
        ignoreUntilMs: ignoreUntil,
        nowMs: now(),
      })) return;
      chrome.runtime.sendMessage({
        type: 'watchparty:local-player-event',
        eventName: 'player:heartbeat',
        positionSec: video.currentTime || 0,
        ...makeMetadata(provider, video),
      }).catch(() => {});
    }

    function startHeartbeat() {
      if (heartbeatTimer || !controlAllowed) return;
      heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);
    }

    function stopHeartbeat() {
      if (!heartbeatTimer) return;
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    function sampleActivity() {
      if (!video) return;
      const sample = { at: now(), time: video.currentTime || 0 };
      const moved = Math.abs(sample.time - lastPositionSample.time) > 0.15;
      lastPositionSample = sample;
      if (moved && !video.paused) startHeartbeat();
    }

    function handleRuntimeMessage(message) {
      if (message?.type === 'watchparty:remote-player-event') {
        applyRemote(message.eventName, message.payload);
      }

      if (message?.type === 'watchparty:status') {
        connected = !!message.connected;
        controlAllowed = !!message.canControlPlayback;
        roomCode = message.roomCode || roomCode;
        if (!connected || !controlAllowed || video?.paused) stopHeartbeat();
        if (connected && controlAllowed && video && !video.paused) startHeartbeat();
      }
    }

    function start() {
      refreshVideo();
      observer = new MutationObserver(refreshVideo);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.setInterval(() => {
        refreshVideo();
        sampleActivity();
      }, 2000);
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
      sendStatus(video ? 'Video detected.' : 'Waiting for video.');
    }

    function stop() {
      detach();
      observer?.disconnect();
      stopHeartbeat();
    }

    return { start, stop, refreshVideo, applyRemote };
  }

  window.WatchPartyOttCore = {
    createAdapter,
    defaultFindVideo,
    hashText,
    scoreVideo,
    _test: { scoreVideo, hashText },
  };
})();
