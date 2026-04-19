'use client';

import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';

type Message = {
  _id?: string;
  userName: string;
  text: string;
  createdAt?: string;
  isSystem?: boolean;
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

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      setMessages((prev) => [...prev, message]);
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
    socket.on('room:state', handleRoomState);

    return () => {
      socket.off('chat:new', handleNewMessage);
      socket.off('room:state', handleRoomState);
    };
  }, []);

  useEffect(() => {
    if (!shouldStickToBottom) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, shouldStickToBottom]);

  const handleScroll = () => {
    const box = scrollBoxRef.current;
    if (!box) return;

    const distanceFromBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight;

    setShouldStickToBottom(distanceFromBottom < 80);
  };

  const sendMessage = () => {
    if (!text.trim()) return;

    socket.emit('chat:send', {
      roomCode,
      userName: currentUserName,
      text,
    });

    setText('');
    setShouldStickToBottom(true);
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3>Live Chat</h3>

      <div
        ref={scrollBoxRef}
        onScroll={handleScroll}
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        {messages.map((message, index) => (
          <div
            key={message._id || `${message.userName}-${index}-${message.text}`}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              background: message.isSystem
                ? 'rgba(59,130,246,0.08)'
                : 'rgba(255,255,255,0.04)',
            }}
          >
            {!message.isSystem && (
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {message.userName}
              </div>
            )}
            <div>{message.text}</div>
          </div>
        ))}

        <div ref={chatEndRef} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{ margin: 0, flex: 1 }}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
