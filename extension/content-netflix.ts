// TypeScript source mirror for content-netflix.js. Keep the JS file as the load-unpacked MV3 artifact.
(() => {
  const SITE = 'netflix';
  let video = null;
  let observer = null;
  let ignoreNext = false;
  let lastSeekSentAt = 0;

  function send(eventName, positionSec) {
    chrome.runtime.sendMessage({
      type: 'watchparty:local-player-event',
      site: SITE,
      eventName,
      positionSec,
    }).catch(() => {});
  }

  function withIgnore(action) {
    ignoreNext = true;
    action();
    window.setTimeout(() => {
      ignoreNext = false;
    }, 700);
  }

  function currentPosition() {
    return video?.currentTime || 0;
  }

  function onPlay() {
    if (ignoreNext) return;
    send('player:play', currentPosition());
  }

  function onPause() {
    if (ignoreNext) return;
    send('player:pause', currentPosition());
  }

  function onSeeked() {
    if (ignoreNext) return;
    const now = Date.now();
    if (now - lastSeekSentAt < 1000) return;
    lastSeekSentAt = now;
    send('player:seek', currentPosition());
  }

  function detach() {
    if (!video) return;
    video.removeEventListener('play', onPlay);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('seeked', onSeeked);
  }

  function attach(nextVideo) {
    if (!nextVideo || nextVideo === video) return;
    detach();
    video = nextVideo;
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
  }

  function findVideo() {
    attach(document.querySelector('video'));
  }

  function applyRemote(eventName, payload = {}) {
    if (!video) findVideo();
    if (!video) return;

    const serverLatencySec = payload.atServerTs ? Math.max(0, (Date.now() - payload.atServerTs) / 1000) : 0;
    const playingTarget = eventName === 'player:play' || !video.paused;
    const positionSec = Number(payload.positionSec || 0) + (playingTarget ? serverLatencySec : 0);

    withIgnore(() => {
      if (eventName === 'player:heartbeat') {
        if (Math.abs(video.currentTime - positionSec) > 1.5) {
          video.currentTime = positionSec;
        }
        return;
      }

      if (eventName === 'player:seek') {
        video.currentTime = Number(payload.positionSec || 0);
        return;
      }

      if (Math.abs(video.currentTime - positionSec) > 0.4) {
        video.currentTime = positionSec;
      }

      if (eventName === 'player:play') {
        video.play().catch(() => {});
      }

      if (eventName === 'player:pause') {
        video.pause();
      }
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'watchparty:remote-player-event') {
      applyRemote(message.eventName, message.payload);
    }
  });

  findVideo();
  observer = new MutationObserver(findVideo);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('pagehide', () => {
    detach();
    observer?.disconnect();
  });
})();
