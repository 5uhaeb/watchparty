const Message = require('../models/Message');
const Room = require('../models/Room');
const {
  presenceJoin,
  presenceDisconnect,
  presenceLeave,
  isMember,
  updatePresenceName,
  getCallMembers,
} = require('../lib/presence');

function serializeMessage(message) {
  return {
    id: message._id,
    _id: message._id,
    roomId: message.roomId,
    userId: message.userId,
    username: message.username,
    userName: message.username,
    text: message.text,
    type: message.type,
    createdAt: message.createdAt,
  };
}

function getRoomCode(socket, roomCode) {
  return roomCode || socket.roomCode;
}

function getUserId(socket, userId) {
  return socket.data?.guestId || userId || socket.userData?.id || socket.userData?.name;
}

function isOwnerOrAdmin(room, userId) {
  return !!userId && (
    room.ownerGuestId === userId ||
    room.adminGuestIds?.includes(userId)
  );
}

function can(room, userId, permission) {
  if (!room || !userId) return false;
  if (isOwnerOrAdmin(room, userId)) return true;
  return room.permissions?.[permission] === 'all';
}

function normalizeProvider(provider) {
  const value = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (value === 'jiohotstar') return 'hotstar';
  if (['netflix', 'prime', 'hotstar', 'ott'].includes(value)) return value;
  return '';
}

function parsePositionSec(positionSec) {
  const nextPosition = Number(positionSec);
  if (!Number.isFinite(nextPosition) || nextPosition < 0 || nextPosition > 48 * 60 * 60) {
    return null;
  }
  return nextPosition;
}

function sanitizeSourceMeta(payload = {}) {
  return {
    sourceType: payload.sourceType,
    tabUrlHash: typeof payload.tabUrlHash === 'string' ? payload.tabUrlHash.slice(0, 80) : undefined,
    title: typeof payload.title === 'string' ? payload.title.slice(0, 160) : undefined,
    pageUrl: typeof payload.pageUrl === 'string' ? payload.pageUrl.slice(0, 300) : undefined,
    paused: typeof payload.paused === 'boolean' ? payload.paused : undefined,
    playbackRate: Number.isFinite(Number(payload.playbackRate)) ? Number(payload.playbackRate) : undefined,
  };
}

function validateOttPayload(room, payload = {}) {
  if (payload.sourceType === 'ott-sync' || room?.source?.type === 'ott-sync') {
    return { ok: false, message: 'OTT sync is disabled.' };
  }

  return { ok: true, meta: sanitizeSourceMeta(payload) };
}

async function isRoomMember(room, userId) {
  if (!room || !userId) return false;
  return (
    isOwnerOrAdmin(room, userId) ||
    (await isMember(room.code, userId))
  );
}

function isValidLocalStreamFileName(fileName) {
  return typeof fileName === 'string' && fileName.trim() && !/[/\\:]/.test(fileName);
}

function extractYouTubeVideoId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return url.searchParams.get('v') || null;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeHttpUrl(rawUrl) {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!value || value.length > 1000) throw new Error('Enter a valid URL');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }

  return url.toString();
}

function isDirectMediaUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8|mpd)(?:$|[?#])/i.test(url.pathname) ||
      url.search.toLowerCase().includes('m3u8')
    );
  } catch {
    return false;
  }
}

function normalizeSource(payload, socket) {
  if (!payload || payload.type === 'clear') return null;

  if (payload.type === 'youtube') {
    const url = normalizeHttpUrl(payload.url);
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) throw new Error('Enter a valid YouTube URL');
    return { type: 'youtube', url, videoId };
  }

  if (payload.type === 'url') {
    const url = normalizeHttpUrl(payload.url);
    return {
      type: 'url',
      url,
      mode: isDirectMediaUrl(url) ? 'media' : 'embed',
    };
  }

  if (payload.type === 'localStream') {
    if (!isValidLocalStreamFileName(payload.fileName)) {
      throw new Error('fileName must not contain path separators');
    }
    return {
      type: 'localStream',
      fileName: payload.fileName.trim(),
      sizeBytes: Number(payload.sizeBytes) || 0,
      durationSec: Number(payload.durationSec) || 0,
      hostSocketId: socket.id,
      hostGuestId: socket.data?.guestId,
    };
  }

  if (payload.type === 'game') {
    const gameId = typeof payload.gameId === 'string' ? payload.gameId.trim().toLowerCase() : '';
    if (gameId !== 'hyperion') throw new Error('Unsupported game');
    return {
      type: 'game',
      gameId,
      title: 'HYPERION.EXE',
      url: '/games/hyperion/index.html',
    };
  }

  if (payload.type === 'ott-sync') {
    throw new Error('OTT sync is disabled.');
  }

  throw new Error('Unsupported source type');
}

function emitSourceChanged(io, roomCode, room, source = room.source || null) {
  io.to(roomCode).emit('room:state', { room });
  io.to(roomCode).emit('source:changed', { source, room });
  io.to(roomCode).emit('room:sourceChanged', { source, room });
}

function consumeBucket(socket, name, capacity, refillMs) {
  socket.rateBuckets ||= {};
  const now = Date.now();
  const bucket = socket.rateBuckets[name] || { tokens: capacity, resetAt: now + refillMs };

  if (now >= bucket.resetAt) {
    bucket.tokens = capacity;
    bucket.resetAt = now + refillMs;
  }

  if (bucket.tokens <= 0) {
    socket.rateBuckets[name] = bucket;
    socket.emit('rate:limited', {
      scope: name,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
    });
    return false;
  }

  bucket.tokens -= 1;
  socket.rateBuckets[name] = bucket;
  return true;
}

async function emitChatHistory(socket, roomCode) {
  const targetRoomCode = roomCode || socket.roomCode;
  if (!targetRoomCode) return;

  const room = await Room.findOne({ code: targetRoomCode, isActive: true });
  if (!room) return;

  const messages = await Message.find({ roomId: room._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(50);

  socket.emit('chat:history', messages.reverse().map(serializeMessage));
}

function getCompensatedPosition(playback = {}) {
  let positionSec = Number(playback.currentTime || 0);
  if (playback.isPlaying && playback.updatedAt) {
    const elapsed = (Date.now() - new Date(playback.updatedAt).getTime()) / 1000;
    positionSec = Math.max(0, positionSec + elapsed);
  }
  return positionSec;
}

function serializePlayerState(room) {
  const playback = room.playback || {};
  const positionSec = getCompensatedPosition(playback);
  const serverTs = Date.now();
  return {
    source: room.source || null,
    positionSec,
    mediaTimeMs: Math.round(positionSec * 1000),
    isPlaying: !!playback.isPlaying,
    hostUserId: room.ownerGuestId,
    hostId: playback.updatedBy || room.ownerGuestId,
    serverTs,
    wallClockMs: serverTs,
    provider: playback.provider || room.source?.provider,
    sourceType: room.source?.type,
    tabUrlHash: playback.tabUrlHash,
    title: playback.title,
  };
}

async function handlePlayerEvent(io, socket, eventName, rawPayload = {}) {
  const isHeartbeat = eventName === 'player:heartbeat';
  if (!consumeBucket(socket, isHeartbeat ? 'player:heartbeat' : 'player:control', isHeartbeat ? 6 : 10, isHeartbeat ? 20 * 1000 : 5 * 1000)) return;

  const targetRoomCode = getRoomCode(socket, rawPayload.roomCode);
  const actorUserId = getUserId(socket, rawPayload.userId);
  const nextPosition = parsePositionSec(rawPayload.positionSec);
  if (!targetRoomCode || nextPosition === null) {
    socket.emit('error:validation', { message: 'Invalid playback position.' });
    return;
  }

  const room = await Room.findOne({ code: targetRoomCode, isActive: true });
  if (!room) {
    socket.emit('error:validation', { message: 'Room not found.' });
    return;
  }

  const ottValidation = validateOttPayload(room, rawPayload);
  if (!ottValidation.ok) {
    socket.emit('error:validation', { message: ottValidation.message });
    return;
  }

  if (!can(room, actorUserId, 'controlPlayback')) {
    socket.emit('error:validation', { message: 'You do not have permission to control playback.' });
    return;
  }

  const atServerTs = Date.now();
  const isPlaying = eventName === 'player:play' ? true : eventName === 'player:pause' ? false : room.playback?.isPlaying || false;
  const meta = ottValidation.meta || {};
  const playbackRate = Number(rawPayload.playbackRate);
  const playbackSet = {
    'playback.currentTime': nextPosition,
    'playback.updatedAt': new Date(atServerTs),
    'playback.updatedBy': actorUserId || 'unknown',
  };

  if (eventName === 'player:play' || eventName === 'player:pause') {
    playbackSet['playback.isPlaying'] = isPlaying;
  }

  await Room.findOneAndUpdate({ code: targetRoomCode }, { $set: playbackSet });

  socket.to(targetRoomCode).emit(eventName, {
    positionSec: nextPosition,
    mediaTimeMs: Math.round(nextPosition * 1000),
    wallClockMs: atServerTs,
    atServerTs,
    byUserId: actorUserId,
    hostId: actorUserId,
    playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
    roomCode: targetRoomCode,
    ...meta,
  });
}

function registerRoomSocket(io, socket) {
  socket.on('guest:nameChanged', async ({ displayName } = {}) => {
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (name.length < 2 || name.length > 24) return;

    socket.data.displayName = name;
    if (socket.userData) socket.userData.name = name;
    if (socket.callUserId) socket.callName = name;

    await updatePresenceName(io, socket, name);
    if (socket.roomCode) {
      io.to(socket.roomCode).emit('guest:nameChanged', {
        guestId: socket.data?.guestId,
        displayName: name,
      });
    }
  });

  socket.on('user:join', ({ userId }) => {
    const guestId = socket.data?.guestId || userId;
    if (!guestId) return;
    socket.userId = guestId;
    socket.join(`user:${guestId}`);
  });

  socket.on('room:join', async ({ roomCode, user = {} }) => {
    const guestId = socket.data?.guestId || user.id || user.name;
    const displayName = socket.data?.displayName || user.name || 'Guest';

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.userData = { id: guestId, name: displayName };
    socket.userId = guestId;
    socket.join(`user:${guestId}`);

    const room = await Room.findOne({ code: roomCode, isActive: true });

    if (!room) return;

    socket.isHost = room.ownerGuestId === guestId;
    const presence = await presenceJoin(io, roomCode, socket);
    const roomState = { ...room.toObject(), participants: presence };

    const messages = await Message.find({ roomId: room._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50);

    // full state only to the user who joined
    socket.emit('room:state', { room: roomState });
    socket.emit('chat:history', messages.reverse().map(serializeMessage));

    // lightweight participant update + system message to everyone else
    socket.to(roomCode).emit('room:state', {
      room: roomState,
      systemMessage: `${displayName} joined the room`,
    });

    const pb = room.playback || {};
    let currentTime = pb.currentTime || 0;

    if (pb.isPlaying && pb.updatedAt) {
      const elapsed =
        (Date.now() - new Date(pb.updatedAt).getTime()) / 1000;
      currentTime = Math.max(0, currentTime + elapsed);
    }

    socket.emit('reconnect:sync', {
      isPlaying: !!pb.isPlaying,
      currentTime,
      atServerTs: Date.now(),
    });
  });

  socket.on('chat:send', async ({ roomCode, userName, text }) => {
    if (!consumeBucket(socket, 'chat', 5, 10 * 1000)) return;
    if (!text) return;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return;

    const targetRoomCode = roomCode || socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const userId = socket.data?.guestId || socket.userData?.id || userName;
    const username = socket.data?.displayName || socket.userData?.name || userName;

    const saved = await Message.create({
      roomId: room._id,
      userId,
      username,
      text: trimmed,
      type: 'chat',
    });

    io.to(targetRoomCode).emit('chat:new', {
      ...serializeMessage(saved),
    });
  });

  socket.on('chat:history', async ({ roomCode } = {}) => {
    await emitChatHistory(socket, roomCode);
  });

  socket.on('player:play', async (payload = {}) => {
    await handlePlayerEvent(io, socket, 'player:play', payload);
  });

  socket.on('player:pause', async (payload = {}) => {
    await handlePlayerEvent(io, socket, 'player:pause', payload);
  });

  socket.on('player:seek', async (payload = {}) => {
    await handlePlayerEvent(io, socket, 'player:seek', payload);
  });

  socket.on('player:heartbeat', async (payload = {}) => {
    await handlePlayerEvent(io, socket, 'player:heartbeat', payload);
  });

  socket.on('player:state', async ({ roomCode } = {}, callback) => {
    if (!consumeBucket(socket, 'player', 10, 5 * 1000)) return;

    const targetRoomCode = getRoomCode(socket, roomCode);
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const payload = serializePlayerState(room);
    if (typeof callback === 'function') {
      callback(payload);
      return;
    }
    socket.emit('player:state', payload);
  });

  socket.on('player:manual-sync', async ({ roomCode } = {}, callback) => {
    if (!consumeBucket(socket, 'player:manual-sync', 3, 5 * 1000)) return;

    const targetRoomCode = getRoomCode(socket, roomCode);
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const payload = serializePlayerState(room);
    if (typeof callback === 'function') {
      callback(payload);
      return;
    }
    socket.emit('player:manual-sync', payload);
  });

  socket.on('room:setSource', async (payload = {}) => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const actorUserId = getUserId(socket);
    if (!can(room, actorUserId, 'changeSource')) {
      socket.emit('error:validation', { message: 'You do not have permission to change the source.' });
      return;
    }

    let source;
    try {
      source = normalizeSource(payload, socket);
    } catch (error) {
      socket.emit('error:validation', { message: error.message });
      return;
    }

    room.source = source;
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    room.lastActivityAt = new Date();
    await room.save();

    emitSourceChanged(io, targetRoomCode, room, source);
  });

  socket.on('room:stopLocalStream', async () => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room) return;

    const actorUserId = getUserId(socket);
    if (!can(room, actorUserId, 'changeSource')) return;
    if (room.source?.type !== 'localStream') return;

    room.source = null;
    room.playback = {
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date(),
      updatedBy: actorUserId || 'unknown',
    };
    room.lastActivityAt = new Date();
    await room.save();

    emitSourceChanged(io, targetRoomCode, room, null);
  });

  socket.on('webrtc:viewerReady', async () => {
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    const actorUserId = getUserId(socket);
    if (!room || !(await isRoomMember(room, actorUserId))) return;
    if (room.source?.type !== 'localStream' || !room.source?.hostSocketId) return;
    if (room.source.hostSocketId === socket.id) return;

    io.to(room.source.hostSocketId).emit('webrtc:viewerReady', {
      viewerSocketId: socket.id,
    });
  });

  socket.on('webrtc:signal', async ({ toSocketId, data }) => {
    if (!toSocketId || !data) return;
    const targetRoomCode = socket.roomCode;
    if (!targetRoomCode) return;

    const targetSocket = io.sockets.sockets.get(toSocketId);
    if (!targetSocket || targetSocket.roomCode !== targetRoomCode) return;

    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    const actorUserId = getUserId(socket);
    if (!room || !(await isRoomMember(room, actorUserId))) return;
    if (room.source?.type !== 'localStream') return;

    io.to(toSocketId).emit('webrtc:signal', {
      fromSocketId: socket.id,
      data,
    });
  });


  // anyone in the room can drive sync now
  socket.on('playback:update', async ({ roomCode, playback, userId }) => {
    const room = await Room.findOne({ code: roomCode });
    if (!room) return;

    const isHost = isOwnerOrAdmin(room, userId);
    if (!isHost && room.permissions?.controlPlayback !== 'all') return;

    const nextPlayback = {
      isPlaying: !!playback?.isPlaying,
      currentTime: Number(playback?.currentTime || 0),
      updatedAt: new Date(),
      updatedBy: userId || 'unknown',
    };

    await Room.findOneAndUpdate(
      { code: roomCode },
      { playback: nextPlayback }
    );

    socket.to(roomCode).emit('playback:update', {
      ...nextPlayback,
      atServerTs: Date.now(),
    });
  });

  socket.on('room:kick', async ({ roomCode, targetName }) => {
    const hostUserId = getUserId(socket);
    const room = await Room.findOne({ code: roomCode });
    if (!room || !isOwnerOrAdmin(room, hostUserId)) return;

    const socketsInRoom = await io.in(roomCode).fetchSockets();

    for (const s of socketsInRoom) {
      if (s.userData?.name === targetName && s.id !== socket.id) {
        s.emit('room:kicked', {
          reason: 'You were removed by the host.',
        });
        await presenceLeave(io, s);
        s.leave(roomCode);
        break;
      }
    }

    const updatedRoom = await Room.findOne({ code: roomCode });
    if (updatedRoom) {
      io.to(roomCode).emit('room:state', { room: updatedRoom });
    }
  });

  socket.on('call:join', async ({ roomCode, userId, name } = {}, callback) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const guestId = socket.data?.guestId || userId || socket.userData?.id;
    const displayName = socket.data?.displayName || name || socket.userData?.name || guestId;

    if (!targetRoomCode || !guestId) {
      callback?.({ ok: false, message: 'Missing room or guest identity.' });
      return;
    }

    socket.join(targetRoomCode);
    socket.roomCode ||= targetRoomCode;
    socket.callRoomCode = targetRoomCode;

    const members = await getCallMembers(io, targetRoomCode, socket.id);
    if (members.length >= 10) {
      socket.callRoomCode = null;
      socket.callUserId = null;
      socket.callName = null;
      socket.emit('call:full', { limit: 10 });
      callback?.({ ok: false, message: 'Video call is full.', limit: 10 });
      return;
    }

    socket.callUserId = guestId;
    socket.callName = displayName;
    socket.data.callRoomCode = targetRoomCode;
    socket.data.callUserId = guestId;
    socket.data.callName = displayName;

    const payload = { members, selfSocketId: socket.id, limit: 10 };
    callback?.({ ok: true, ...payload });
    socket.emit('call:members', payload);
    socket.to(targetRoomCode).emit('call:user-joined', {
      socketId: socket.id,
      userId: guestId,
      name: displayName,
    });
  });

  socket.on('call:signal', async ({ to, from, signal }) => {
    if (!to || !signal || !socket.callRoomCode || !socket.callUserId) return;

    const roomSockets = await io.in(socket.callRoomCode).fetchSockets();
    const target = roomSockets.find((roomSocket) => (
      roomSocket.id === to ||
      roomSocket.callUserId === to ||
      roomSocket.data?.callUserId === to
    ));

    if (target && (target.callUserId || target.data?.callUserId)) {
      io.to(target.id).emit('call:signal', {
        fromSocketId: socket.id,
        fromUserId: from || socket.callUserId,
        fromName: socket.callName,
        signal
      });
    }
  });

  socket.on('call:leave', ({ roomCode } = {}) => {
    const targetRoomCode = roomCode || socket.callRoomCode || socket.roomCode;
    if (targetRoomCode && socket.callUserId) {
      socket.to(targetRoomCode).emit('call:user-left', {
        userId: socket.callUserId,
        socketId: socket.id,
      });
    }
    socket.callRoomCode = null;
    socket.callUserId = null;
    socket.callName = null;
    socket.data.callRoomCode = null;
    socket.data.callUserId = null;
    socket.data.callName = null;
  });

  socket.on('call:media-state', ({ roomCode, state } = {}) => {
    const targetRoomCode = roomCode || socket.callRoomCode || socket.roomCode;
    if (!targetRoomCode || !socket.callUserId) return;
    socket.to(targetRoomCode).emit('call:media-state', {
      userId: socket.callUserId,
      socketId: socket.id,
      state: state || {},
    });
  });

  socket.on('call:speaking', ({ roomCode, speaking } = {}) => {
    const targetRoomCode = roomCode || socket.callRoomCode || socket.roomCode;
    if (!targetRoomCode || !socket.callUserId) return;
    socket.to(targetRoomCode).emit('call:speaking', {
      userId: socket.callUserId,
      socketId: socket.id,
      speaking: !!speaking,
    });
  });

  socket.on('call:video-frame', ({ roomCode, frame, width, height, sentAt } = {}) => {
    const targetRoomCode = roomCode || socket.callRoomCode || socket.roomCode;
    if (!targetRoomCode || !socket.callUserId || socket.callRoomCode !== targetRoomCode) return;
    if (typeof frame !== 'string' || !frame.startsWith('data:image/') || frame.length > 180000) return;

    socket.to(targetRoomCode).emit('call:video-frame', {
      socketId: socket.id,
      userId: socket.callUserId,
      name: socket.callName,
      frame,
      width: Number(width) || 0,
      height: Number(height) || 0,
      sentAt: Number(sentAt) || Date.now(),
    });
  });

  socket.on('room:leave', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode, userData } = socket;
    await presenceLeave(io, socket);
    socket.leave(roomCode);
    socket.roomCode = null;
    io.to(roomCode).emit('room:state', {
      room: await Room.findOne({ code: roomCode }),
      systemMessage: `${userData.name} left the room`,
    });
  });

  socket.on('room:end', async ({ roomCode, userId } = {}) => {
    const targetRoomCode = getRoomCode(socket, roomCode);
    const actorUserId = getUserId(socket, userId);
    const room = await Room.findOne({ code: targetRoomCode, isActive: true });
    if (!room || !isOwnerOrAdmin(room, actorUserId)) return;

    room.isActive = false;
    await room.save();

    io.to(targetRoomCode).emit('room:ended', {
      roomCode: targetRoomCode,
      byUserId: actorUserId,
    });
  });

  socket.on('disconnect', async () => {
    if (!socket.roomCode || !socket.userData) return;

    const { roomCode } = socket;
    if (socket.callUserId) {
      socket.to(roomCode).emit('call:user-left', {
        userId: socket.callUserId,
        socketId: socket.id,
      });
    }

    await presenceDisconnect(io, socket);
  });
}

module.exports = registerRoomSocket;
module.exports._test = {
  can,
  consumeBucket,
  normalizeProvider,
  parsePositionSec,
  validateOttPayload,
};
