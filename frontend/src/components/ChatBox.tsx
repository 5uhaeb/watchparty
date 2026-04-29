'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { getRoomMessages } from '@/lib/api';

type Message = {
  id?: string;
  _id?: string;
  userId?: string;
  userName?: string;
  username?: string;
  text: string;
  createdAt?: string;
  isSystem?: boolean;
  type?: 'chat' | 'system';
};

export default function ChatBox({
  roomCode,
  currentUserName,
  initialMessages = [],
}: {
  roomCode: string;
  currentUserName: string;
  initialMessages?: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState('');
  const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [namesByGuestId, setNamesByGuestId] = useState<Record<string, string>>({});

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<Message[]>(initialMessages);

  const messageKey = (message: Message) =>
    message.id || message._id || `${message.username || message.userName}-${message.createdAt}-${message.text}`;

  const mergeMessages = (current: Message[], incoming: Message[], position: 'append' | 'prepend' | 'replace') => {
    if (position === 'replace') return incoming;

    const seen = new Set(current.map(messageKey));
    const unique = incoming.filter((message) => !seen.has(messageKey(message)));
    return position === 'prepend' ? [...unique, ...current] : [...current, ...unique];
  };

  useEffect(() => {
    setMessages(initialMessages);
    messagesRef.current = initialMessages;
  }, [initialMessages]);

  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      setMessages((prev) => mergeMessages(prev, [message], 'append'));
    };

    const handleNameChanged = ({ guestId, displayName }: { guestId?: string; displayName?: string }) => {
      if (!guestId || !displayName) return;
      setNamesByGuestId((current) => ({ ...current, [guestId]: displayName }));
    };

    const handlePresence = (payload: { members?: Array<{ guestId?: string; displayName?: string }> }) => {
      const nextNames: Record<string, string> = {};
      for (const member of payload.members || []) {
        if (member.guestId && member.displayName) nextNames[member.guestId] = member.displayName;
      }
      if (Object.keys(nextNames).length) {
        setNamesByGuestId((current) => ({ ...current, ...nextNames }));
      }
    };

    const handleHistory = (history: Message[]) => {
      setMessages((prev) => mergeMessages(prev, history, prev.length ? 'prepend' : 'replace'));
      setShouldStickToBottom(true);
      setHasOlder(history.length >= 50);
    };

    const handleRoomState = (payload: any) => {
      if (!payload.systemMessage) return;

      setMessages((prev) => [
        ...prev,
        {
          _id: Math.random().toString(),
          userName: 'System',
          text: payload.systemMessage,
          createdAt: new Date().toISOString(),
          isSystem: true,
        },
      ]);
    };

    socket.on('chat:new', handleNewMessage);
    socket.on('chat:history', handleHistory);
    socket.on('room:state', handleRoomState);
    socket.on('room:presence', handlePresence);
    socket.on('guest:nameChanged', handleNameChanged);
    socket.on('participant:updated', handleNameChanged);
    socket.on('rate:limited', handleRateLimited);

    return () => {
      socket.off('chat:new', handleNewMessage);
      socket.off('chat:history', handleHistory);
      socket.off('room:state', handleRoomState);
      socket.off('room:presence', handlePresence);
      socket.off('guest:nameChanged', handleNameChanged);
      socket.off('participant:updated', handleNameChanged);
      socket.off('rate:limited', handleRateLimited);
    };
  }, []);

  const handleRateLimited = (payload: { scope?: string; retryAfterMs?: number }) => {
    if (payload.scope !== 'chat') return;
    setCooldownUntil(Date.now() + Math.max(0, payload.retryAfterMs || 0));
  };

  useEffect(() => {
    if (!cooldownUntil) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [cooldownUntil]);

  useEffect(() => {
    if (cooldownUntil && now >= cooldownUntil) {
      setCooldownUntil(0);
    }
  }, [cooldownUntil, now]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!shouldStickToBottom) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, shouldStickToBottom]);

  const loadOlderMessages = async () => {
    const box = scrollBoxRef.current;
    const oldestLoaded = messagesRef.current.find((message) => !message.isSystem && message.createdAt);
    if (!box || !oldestLoaded?.createdAt || loadingOlder || !hasOlder) return;

    setLoadingOlder(true);
    const previousScrollHeight = box.scrollHeight;

    try {
      const olderNewestFirst = await getRoomMessages(roomCode, {
        limit: 50,
        before: oldestLoaded.createdAt,
      });
      const olderChronological = [...olderNewestFirst].reverse();

      setHasOlder(olderNewestFirst.length >= 50);
      setMessages((prev) => mergeMessages(prev, olderChronological, 'prepend'));

      requestAnimationFrame(() => {
        if (!scrollBoxRef.current) return;
        scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight - previousScrollHeight;
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleScroll = () => {
    const box = scrollBoxRef.current;
    if (!box) return;

    const distanceFromBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight;

    setShouldStickToBottom(distanceFromBottom < 80);

    if (box.scrollTop <= 20) {
      loadOlderMessages();
    }
  };

  const sendMessage = () => {
    if (!text.trim() || cooldownUntil > Date.now()) return;

    socket.emit('chat:send', {
      roomCode,
      userName: currentUserName,
      text: text.trim(),
    });

    setText('');
    setShouldStickToBottom(true);
  };

  const cooldownMs = Math.max(0, cooldownUntil - now);
  const isCoolingDown = cooldownMs > 0;

  return (
    <div className="chat-panel">
      <h3>Live Chat</h3>

      <div
        className="chat-scroll"
        ref={scrollBoxRef}
        onScroll={handleScroll}
      >
        {messages.map((message, index) => (
          <div
            key={messageKey(message) || index}
            className={`chat-message ${message.isSystem ? 'chat-message-system' : ''} ${(message.username || message.userName) === currentUserName ? 'chat-message-own' : ''}`}
          >
            {!message.isSystem && (
              <div className="chat-message-author">
                {message.userId && namesByGuestId[message.userId]
                  ? namesByGuestId[message.userId]
                  : message.username || message.userName}
              </div>
            )}
            <div className="chat-message-text">{message.text}</div>
          </div>
        ))}

        <div ref={chatEndRef} />
      </div>

      <div className="chat-form">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={isCoolingDown ? `Slow down ${Math.ceil(cooldownMs / 1000)}s` : 'Type a message...'}
          disabled={isCoolingDown}
          style={{ margin: 0 }}
        />
        <button onClick={sendMessage} disabled={isCoolingDown}>Send</button>
      </div>
      {isCoolingDown && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Message cooldown active for {Math.ceil(cooldownMs / 1000)}s.
        </div>
      )}
    </div>
  );
}
