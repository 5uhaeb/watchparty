import { io } from 'socket.io-client';

export const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
  autoConnect: false,
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 8000
});
