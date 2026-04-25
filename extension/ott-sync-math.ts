// TypeScript source mirror for ott-sync-math.js. Keep the JS file as the load-unpacked MV3 artifact.
(() => {
  const RATE_DRIFT_SEC = 0.35;
  const SEEK_DRIFT_SEC = 1.5;

  function decideDriftAction(localTime, targetTime, isPlaying, readyState) {
    const drift = Number(targetTime) - Number(localTime);
    const absDrift = Math.abs(drift);

    if (!Number.isFinite(drift)) return { action: 'none', drift: 0 };
    if (absDrift < RATE_DRIFT_SEC) return { action: 'none', drift };
    if (absDrift <= SEEK_DRIFT_SEC && isPlaying && readyState >= 3) {
      return { action: 'rate', drift, rate: drift > 0 ? 1.05 : 0.95 };
    }
    return { action: 'seek', drift, positionSec: Math.max(0, Number(targetTime) || 0) };
  }

  function shouldSendLocalEvent({ controlAllowed, ignoreUntilMs, nowMs, hasVideo }) {
    return !!hasVideo && !!controlAllowed && Number(nowMs || 0) >= Number(ignoreUntilMs || 0);
  }

  const api = { decideDriftAction, shouldSendLocalEvent, RATE_DRIFT_SEC, SEEK_DRIFT_SEC };
  if (typeof window !== 'undefined') window.WatchPartyOttMath = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
