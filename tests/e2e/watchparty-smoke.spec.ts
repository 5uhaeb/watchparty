import { expect, type Page, test } from '@playwright/test';
import { io, Socket } from 'socket.io-client';

const backendURL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:5000';

async function testLogin(page: Page, email: string) {
  await page.goto('/api/auth/signin/test-login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('test-password');
  await page.locator('button[type="submit"]').click();
  await page.goto('/dashboard');
  await expect(page.getByText(email.split('@')[0])).toBeVisible();
}

function waitForSocketEvent<T>(socket: Socket, eventName: string) {
  return new Promise<T>((resolve) => socket.once(eventName, resolve));
}

test('two users can create, join, chat, sync playback, and hit chat rate limits', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await testLogin(host, 'host@example.com');
  await testLogin(guest, 'guest@example.com');

  await host.goto('/create-room');
  await host.locator('input[placeholder="e.g. Movie Night"]').fill('E2E Watch Room');
  await host.locator('select').first().selectOption('ott-sync');
  await host.getByRole('button', { name: /create watch party/i }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]+/);

  const roomCode = new URL(host.url()).pathname.split('/').pop() || '';
  expect(roomCode).toHaveLength(6);

  await guest.goto('/dashboard');
  await guest.locator('input[placeholder^="Room code"]').fill(roomCode);
  await guest.getByRole('button', { name: /^Join Room$/ }).click();
  await guest.waitForURL(new RegExp(`/room/${roomCode}`));

  const observer = io(backendURL, {
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise<void>((resolve) => observer.once('connect', resolve));
  observer.emit('room:join', {
    roomCode,
    user: { id: 'observer@example.com', name: 'Observer' },
  });

  await host.locator('input[placeholder="Type a message..."]').fill('hello from host');
  await host.getByRole('button', { name: /^Send$/ }).click();
  await expect(guest.getByText('hello from host')).toBeVisible();

  for (let i = 0; i < 5; i += 1) {
    await host.locator('input[placeholder="Type a message..."]').fill(`burst ${i}`);
    await host.getByRole('button', { name: /^Send$/ }).click();
  }
  await expect(host.getByText(/message cooldown active/i)).toBeVisible();

  const playEvent = waitForSocketEvent<{ positionSec: number; atServerTs: number }>(observer, 'player:play');
  await host.getByRole('button', { name: /^Play All$/ }).click();
  const playPayload = await playEvent;
  expect(Math.abs(playPayload.positionSec)).toBeLessThanOrEqual(1);

  const state = await new Promise<any>((resolve) => {
    observer.emit('player:state', { roomCode }, resolve);
  });
  expect(state.isPlaying).toBe(true);
  expect(Math.abs(state.positionSec - playPayload.positionSec)).toBeLessThanOrEqual(1);

  const pauseEvent = waitForSocketEvent<{ positionSec: number; atServerTs: number }>(observer, 'player:pause');
  await host.getByRole('button', { name: /^Pause All$/ }).click();
  await expect(pauseEvent).resolves.toMatchObject({ positionSec: expect.any(Number) });

  observer.disconnect();
  await hostContext.close();
  await guestContext.close();
});
