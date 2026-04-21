'use client';

import { useState, useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import { canDo, RoomState } from '@/lib/permissions';

type Message = {
  _id?: string;
  userName: string;
  text: string;
  createdAt?: string;
  isSystem?: boolean;
};

export default function ChatBox({ roomCode, currentUserName, initialMessages = [], roomState, userId }: { roomCode: string; currentUserName: string; initialMessages?: Message[]; roomState?: RoomState | null; userId?: string }) {
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

    const handleActionDenied = (payload: any) => {
      if (payload.action === 'chat') {
        setMessages((prev) => [
          ...prev,
          { _id: Math.random().toString(), userName: 'System', text: `Chat denied: ${payload.reason}`, createdAt: new Date().toISOString(), isSystem: true }
        ]);
      }
    };

    socket.on('chat:new', handleNewMessage);
    socket.on('room:state', handleRoomState);
    socket.on('action:denied', handleActionDenied);

    return () => {
      socket.off('chat:new', handleNewMessage);
      socket.off('room:state', handleRoomState);
      socket.off('action:denied', handleActionDenied);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!text.trim()) return;
    if (roomState && userId && !canDo(roomState, userId, 'chat')) {
      setMessages((prev) => [
        ...prev,
        { _id: Math.random().toString(), userName: 'System', text: 'You do not have permission to chat', createdAt: new Date().toISOString(), isSystem: true }
      ]);
      return;
    }
    socket.emit('chat:send', { text });
    setText('');
  };

  return (
    <div className="card glass" style={{ display: 'flex', flexDirection: 'column', height: '500px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '0 8px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
        <h3 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reception</h3>
      </div>
      
      <div className="chat-list" style={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '8px', 
        padding: '8px',
        background: 'rgba(0,0,0,0.1)',
        borderRadius: '12px'
      }}>
        {messages.map((message, index) => {
          const isMe = message.userName === currentUserName;
          
          if (message.isSystem) {
            return (
              <div key={message._id || index} style={{ 
                textAlign: 'center', 
                padding: '8px', 
                fontSize: '0.8rem', 
                color: 'var(--text-secondary)',
                fontStyle: 'italic'
              }}>
                — {message.text} —
              </div>
            );
          }

          return (
            <div key={message._id || index} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: isMe ? 'flex-end' : 'flex-start',
              gap: '4px'
            }}>
              <div style={{ fontSize: '0.7rem', color: isMe ? 'var(--primary)' : 'var(--text-secondary)', padding: '0 4px', fontWeight: 600 }}>
                {message.userName.toUpperCase()}
              </div>
              <div style={{ 
                padding: '10px 14px', 
                background: isMe ? 'var(--primary)' : 'var(--surface-hover)', 
                color: isMe ? 'white' : 'var(--text-primary)', 
                borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                fontSize: '0.9rem',
                maxWidth: '85%',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                border: isMe ? 'none' : '1px solid var(--border)'
              }}>
                {message.text}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', padding: '4px' }}>
        <input 
          className="input" 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={roomState && userId && !canDo(roomState, userId, 'chat') ? "Chat disabled" : "Transmit message..."} 
          disabled={roomState && userId ? !canDo(roomState, userId, 'chat') : false}
          style={{ width: '100%', height: '48px' }}
        />
        <button 
          className="button" 
          onClick={sendMessage} 
          disabled={roomState && userId ? !canDo(roomState, userId, 'chat') : false}
          style={{ width: '48px', height: '48px', padding: 0, minWidth: '48px' }}
        >
          <span>↗️</span>
        </button>
      </div>
    </div>
  );
}
