export function getIceServers(): RTCIceServer[] {
  const stunUrls = (process.env.NEXT_PUBLIC_STUN_URLS || 'stun:stun.l.google.com:19302')
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

  if (configuredTurnUrls.length) {
    servers.push({
      urls: configuredTurnUrls,
      username: process.env.NEXT_PUBLIC_TURN_USER || undefined,
      credential: process.env.NEXT_PUBLIC_TURN_CRED || undefined,
    });
  } else {
    servers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }

  return servers;
}

export const ICE_SERVERS = getIceServers();
