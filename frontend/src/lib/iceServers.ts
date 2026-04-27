export function getIceServers(): RTCIceServer[] {
  const stunUrls = (
    process.env.NEXT_PUBLIC_STUN_URLS ||
    'stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478'
  )
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  const servers: RTCIceServer[] = [];
  if (stunUrls.length) {
    servers.push({ urls: stunUrls });
  }

  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS || process.env.NEXT_PUBLIC_TURN_URL;
  const configuredTurnUrls = turnUrls
    ?.split(',')
    .map((url) => url.trim())
    .filter(Boolean) || [];

  const turnUsername =
    process.env.NEXT_PUBLIC_TURN_USER ||
    process.env.NEXT_PUBLIC_TURN_USERNAME ||
    undefined;
  const turnCredential =
    process.env.NEXT_PUBLIC_TURN_CRED ||
    process.env.NEXT_PUBLIC_TURN_PASSWORD ||
    undefined;

  if (configuredTurnUrls.length) {
    servers.push({
      urls: configuredTurnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  } else {
    servers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }

  return servers;
}

export const ICE_SERVERS = getIceServers();

export function getPeerConnectionConfig(): RTCConfiguration {
  const policy = (
    process.env.NEXT_PUBLIC_ICE_TRANSPORT_POLICY ||
    process.env.NEXT_PUBLIC_FORCE_TURN ||
    'relay'
  ).toLowerCase();

  return {
    iceServers: ICE_SERVERS,
    iceTransportPolicy: policy === 'all' || policy === 'false' ? 'all' : 'relay',
    bundlePolicy: 'max-bundle',
  };
}
