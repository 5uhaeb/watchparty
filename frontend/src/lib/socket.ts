import { io } from 'socket.io-client';

export const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
  autoConnect: false,
  transports: ['websocket'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 5000
});

socket.on('connect_error', async (error) => {
  if (!/jwt|auth/i.test(error.message)) return;

  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/guest/bootstrap`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => null);

  if (!socket.connected) {
    socket.connect();
  }
});
