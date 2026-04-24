import { io } from 'socket.io-client';
import { getGuestToken, setGuestToken } from './guestToken';

export const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
  autoConnect: false,
  transports: ['websocket'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 5000
});

socket.io.on('reconnect_attempt', () => {
  socket.auth = { token: getGuestToken() };
});

const connect = socket.connect.bind(socket);
socket.connect = () => {
  socket.auth = { token: getGuestToken() };
  return connect();
};

socket.on('connect_error', async (error) => {
  if (!/jwt|auth/i.test(error.message)) return;

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/guest/bootstrap`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(getGuestToken() ? { Authorization: `Bearer ${getGuestToken()}` } : {}),
    },
  }).catch(() => null);
  const guest = await res?.json().catch(() => null);
  if (guest?.token) setGuestToken(guest.token);

  if (!socket.connected) {
    socket.connect();
  }
});
