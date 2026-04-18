'use client';

import { useState, useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';

type Message = {
  _id?: string;
  userName: string;
  text: string;
  createdAt?: string;
  isSystem?: boolean;
};

export default function ChatBox({ roomCode, currentUserName, initialMessages = [] }: { roomCode: string; currentUserName: string; initialMessages?: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      setMessages((prev) => [...prev, message]);
    };

    const handleRoomState = (payload: any) => {
      if (payload.systemMessage) {
        setMessages((prev) => [
          ...prev,
          { _id: Math.random().toString(), userName: 'System', text: payload.systemMessage, createdAt: new Date().toISOString(), isSystem: true }
        ]);
      }
    };

    socket.on('chat:new', handleNewMessage);
    socket.on('room:state', handleRoomState);

    return () => {
      socket.off('chat:new', handleNewMessage);
      socket.off('room:state', handleRoomState);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!text.trim()) return;
    socket.emit('chat:send', {
      roomCode,
      userName: currentUserName,
      text
    });
    setText('');
  };

  return (
    <div className="card glass" style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
      <h3 style={{ marginBottom: '16px' }}>Live Chat</h3>
      <div className="chat-list" style={{ flexGrow: 1 }}>
        {messages.map((message, index) => (
          <div key={message._id || index} className="chat-item" style={message.isSystem ? { opacity: 0.7, borderStyle: 'dashed' } : {}}>
            <div className="chat-user">{message.isSystem ? '📢' : message.userName}</div>
            <div className="chat-text">{message.text}</div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <input 
          className="input" 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..." 
          style={{ margin: 0 }}
        />
        <button className="button" onClick={sendMessage} style={{ width: 'auto' }}>
          Send
        </button>
      </div>
    </div>
  );
}
