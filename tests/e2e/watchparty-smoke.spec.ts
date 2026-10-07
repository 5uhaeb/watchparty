import { expect, type Page, test } from '@playwright/test';
import { io, Socket } from 'socket.io-client';

const backendURL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:5000';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

async function bootstrapGuest(page: Page, expectedNamePattern = /anonymous guest/i) {
  await page.goto('/dashboard');
  await expect(page.getByText(expectedNamePattern)).toBeVisible();
}

test('two users can create, join, chat, hit rate limits, and receive camera video', async ({ browser }) => {
  const hostContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const guestContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await bootstrapGuest(host);
  await bootstrapGuest(guest);

  await host.goto('/create-room');
  await host.getByLabel('Optional title').fill('E2E Watch Room');
  await host.getByRole('button', { name: /^Create room$/i }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]+/);

  const roomCode = new URL(host.url()).pathname.split('/').pop() || '';
  expect(roomCode).toHaveLength(6);

  await guest.goto('/dashboard');
  await guest.getByLabel('Room code or invite link').fill(roomCode);
  await guest.getByRole('button', { name: /^Join room$/i }).click();
  await guest.waitForURL(new RegExp(`/room/${roomCode}`));

  const bootstrap = await hostContext.request.post(`${backendURL}/api/guest/bootstrap`);
  const cookie = bootstrap.headers()['set-cookie']?.split(';')[0] || '';

  const observer = io(backendURL, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
  });
  await new Promise<void>((resolve) => observer.once('connect', resolve));
  observer.emit('room:join', {
    roomCode,
    user: { id: 'observer', name: 'Observer' },
  });

  await host.locator('input[placeholder="Type a message..."]').fill('hello from host');
  await host.getByRole('button', { name: /^Send$/ }).click();
  await expect(guest.getByText('hello from host')).toBeVisible();

  for (let i = 0; i < 5; i += 1) {
    await host.locator('input[placeholder="Type a message..."]').fill(`burst ${i}`);
    await host.getByRole('button', { name: /^Send$/ }).click();
  }
  await expect(host.getByText(/message cooldown active/i)).toBeVisible();

  const state = await new Promise<any>((resolve) => {
    observer.emit('player:state', { roomCode }, resolve);
  });
  expect(state.isPlaying).toBe(false);
  expect(Math.abs(state.positionSec)).toBeLessThanOrEqual(1);

  for (const page of [host, guest]) {
    await page.getByRole('button', { name: /^Video call$/i }).click();
    await page.getByRole('button', { name: /^Join Call$/ }).click();
    await expect(page.getByRole('button', { name: /^Mute$/ })).toBeVisible();
  }
  for (const page of [host, guest]) {
    await expect.poll(() => page.locator('video[data-call-media]').evaluateAll(
      videos => videos.some(video => (video as HTMLVideoElement).videoWidth > 0)
    )).toBe(true);
  }

  observer.disconnect();
  await hostContext.close();
  await guestContext.close();
});

test('camera frames fall back to sockets when ICE cannot connect', async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ permissions: ['camera', 'microphone'] })));
  try {
    for (const context of contexts) {
      await context.addInitScript(() => {
        const Original = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Original {
          constructor(config?: RTCConfiguration) {
            super({ ...config, iceServers: [], iceTransportPolicy: 'relay' });
          }
        };
      });
    }
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of pages) await bootstrapGuest(page);
    const response = await contexts[0].request.post(`${backendURL}/api/rooms`, { data: { title: 'Fallback E2E room' } });
    expect(response.status()).toBe(201);
    const { code } = await response.json();
    for (const page of pages) {
      await page.goto(`/room/${code}`);
      await page.getByRole('button', { name: /^Video call$/i }).click();
      await page.getByRole('button', { name: /^Join Call$/ }).click();
      await expect(page.getByRole('button', { name: /^Mute$/ })).toBeVisible();
    }
    for (const page of pages) {
      await expect.poll(() => page.locator('.video-call-tile img').evaluateAll(
        images => images.some(image => (image as HTMLImageElement).naturalWidth > 0)
      )).toBe(true);
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
