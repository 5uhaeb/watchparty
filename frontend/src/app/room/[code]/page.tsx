'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { socket } from '@/lib/socket';
import { getRoom } from '@/lib/api';
import { probeVideoFile, type ProbeResult } from '@/lib/probeFile';
import { formatFileSize, formatDuration, formatDimensions } from '@/lib/formats';
import ChatBox from '@/components/ChatBox';
import RoomPlayer from '@/components/RoomPlayer';
import UserList from '@/components/UserList';
import VideoCallPanel from '@/components/VideoCallPanel';
import FileError from '@/components/FileError';
import { useGuest } from '@/components/GuestProvider';
import { guestAuthHeaders } from '@/lib/guestToken';

type SourceTab = 'youtube' | 'url' | 'localStream';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { guest } = useGuest();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [presenceMembers, setPresenceMembers] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('youtube');
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [sourceMessage, setSourceMessage] = useState('');
  const [localStreamFileDraft, setLocalStreamFileDraft] = useState<File | null>(null);
  const [localStreamFile, setLocalStreamFile] = useState<File | null>(null);
  const [fileProbeResult, setFileProbeResult] = useState<ProbeResult | null>(null);
  const [fileProbing, setFileProbing] = useState(false);
  const [streamNotice, setStreamNotice] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [connectionToast, setConnectionToast] = useState('');
  const [loadError, setLoadError] = useState('');

  const guestId = guest?.guestId ?? '';
  const userName = guest?.displayName ?? 'Guest';
  const source = room?.source || null;
  const isHost = !!room && room.ownerGuestId === guestId;
  const isAdmin = !!room && room.adminGuestIds?.includes(guestId);
  const isOwnerOrAdmin = isHost || isAdmin;
  const canChangeSource = isOwnerOrAdmin || room?.permissions?.changeSource === 'all';
  const canControlPlayback = isOwnerOrAdmin || room?.permissions?.controlPlayback === 'all';
  const canEditTitle = isOwnerOrAdmin || room?.permissions?.editTitle === 'all';
  const activeSourceType = localStreamFile ? 'localStream' : source?.type;
  const isLocalStreamer = !!localStreamFile || source?.hostGuestId === guestId;
  const playerCanControl = activeSourceType === 'localStream' ? isLocalStreamer : canControlPlayback;
  const activeSourceData = localStreamFile
    ? { fileName: localStreamFile.name, sizeBytes: localStreamFile.size }
    : source;
  const activeSourceUrl = source?.type === 'youtube' || source?.type === 'url' ? source.url : undefined;

  useEffect(() => {
    if (!code) return;

    socket.connect();

    const joinCurrentRoom = () => {
      socket.emit('room:join', {
        roomCode: code,
        user: { id: guestId, name: userName }
      });
      socket.emit('player:state', { roomCode: code });
      socket.emit('chat:history', { roomCode: code });
    };

    const handleRoomState = (payload: any) => {
      if (payload.room) {
        setRoom(payload.room);
        if (payload.room.participants) setPresenceMembers(payload.room.participants);
      }
      if (payload.messages) setMessages(payload.messages);
    };
    const handlePresence = (payload: any) => {
      setPresenceMembers(payload.members || []);
    };

    const handleKicked = ({ reason }: { reason: string }) => {
      alert(reason);
      router.push('/dashboard');
    };
    const handleEnded = () => {
      alert('This room has ended.');
      router.push('/dashboard');
    };
    const handleSourceChanged = (payload: any) => {
      if (payload.source === null) {
        setStreamNotice('Host ended the stream.');
        setLocalStreamFile(null);
      } else {
        setStreamNotice('');
      }
      if (payload.room) setRoom(payload.room);
      socket.emit('player:state', { roomCode: code });
    };
    const handleDisconnect = () => {
      setConnectionToast('Connection lost - reconnecting...');
    };
    const handleReconnect = () => {
      setConnectionToast('Back online');
      window.setTimeout(() => setConnectionToast(''), 2500);
      joinCurrentRoom();
    };

    socket.on('room:state', handleRoomState);
    socket.on('room:kicked', handleKicked);
    socket.on('room:ended', handleEnded);
    socket.on('room:sourceChanged', handleSourceChanged);
    socket.on('room:presence', handlePresence);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect', handleReconnect);

    joinCurrentRoom();
    getRoom(code)
      .then((nextRoom) => {
        setLoadError('');
        setRoom(nextRoom);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Could not load this room.');
      });

    return () => {
      socket.off('room:state', handleRoomState);
      socket.off('room:kicked', handleKicked);
      socket.off('room:ended', handleEnded);
      socket.off('room:sourceChanged', handleSourceChanged);
      socket.off('room:presence', handlePresence);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect', handleReconnect);
    };
  }, [code, guestId, router, userName]);

  useEffect(() => {
    if (!room) return;
    setTitleDraft(room.title || 'Untitled room');
    if (source?.type === 'youtube' || source?.type === 'url') setSourceUrlDraft(source.url || '');
    if (source?.type !== 'localStream') setLocalStreamFile(null);
  }, [room, source?.type, source?.url]);

  const copyInviteLink = () => {
    const url = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const leaveRoom = () => {
    socket.emit('room:leave');
    router.push('/dashboard');
  };

  const endRoom = async () => {
    if (!canChangeSource) return;
    const confirmed = window.confirm('End this room for everyone?');
    if (!confirmed) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`, {
      method: 'DELETE',
      headers: guestAuthHeaders(),
      credentials: 'include',
    });

    if (res.ok) {
      router.push('/dashboard');
      return;
    }

    alert((await res.json()).message || 'Could not end room.');
  };

  const saveTitle = async () => {
    if (!canEditTitle || !room) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === room.title) {
      setEditingTitle(false);
      setTitleDraft(room.title || 'Untitled room');
      return;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`, {
      method: 'PATCH',
      headers: guestAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ title: nextTitle }),
    });

    if (res.ok) {
      setRoom(await res.json());
      setEditingTitle(false);
      return;
    }

    alert((await res.json()).message || 'Could not update title.');
  };

  const submitSource = () => {
    setSourceMessage('');

    if (!canChangeSource) return;
    if (sourceTab === 'localStream') {
      if (!localStreamFileDraft) {
        setSourceMessage('Choose a local video file to stream.');
        return;
      }
      if (!fileProbeResult?.success) {
        setSourceMessage('File did not pass compatibility check. Please choose a different file.');
        return;
      }
      setLocalStreamFile(localStreamFileDraft);
      setStreamNotice('');
      setShowSourceModal(false);
      return;
    }

    const url = sourceUrlDraft.trim();
    if (!url) {
      setSourceMessage(sourceTab === 'youtube' ? 'Paste a YouTube URL.' : 'Paste a video, stream, or embed URL.');
      return;
    }

    socket.emit('room:setSource', { type: sourceTab, url });
    setLocalStreamFile(null);
    setShowSourceModal(false);
  };

  const clearSource = () => {
    if (!canChangeSource) return;
    setLocalStreamFile(null);
    socket.emit('room:setSource', { type: 'clear' });
    setShowSourceModal(false);
  };

  const updatePermissions = async (nextPermissions: any) => {
    if (!isOwnerOrAdmin || !room) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rooms/${code}`, {
      method: 'PATCH',
      headers: guestAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ permissions: nextPermissions }),
    });

    if (res.ok) {
      setRoom(await res.json());
      return;
    }

    alert((await res.json()).message || 'Could not update permissions.');
  };

  const toggleGuestPermission = (name: 'changeSource' | 'controlPlayback' | 'editTitle') => {
    const current = room?.permissions || {};
    updatePermissions({
      changeSource: current.changeSource || 'ownerAdmin',
      controlPlayback: current.controlPlayback || 'ownerAdmin',
      editTitle: current.editTitle || 'ownerAdmin',
      [name]: current[name] === 'all' ? 'ownerAdmin' : 'all',
    });
  };

  const openSourcePicker = (tab: SourceTab) => {
    setSourceTab(tab);
    setSourceMessage('');
    setShowSourceModal(true);
  };

  const handleFileDropped = async (file: File) => {
    if (!canChangeSource) {
      setStreamNotice('Only the host can change the source.');
      return;
    }

    if (!file.type.startsWith('video/') && !file.name.match(/\.(mkv|avi|mov|m4v|webm|ogv)$/i)) {
      setStreamNotice('Please drop a video file.');
      return;
    }

    setSourceTab('localStream');
    setShowSourceModal(true);
    setLocalStreamFileDraft(file);
    setFileProbeResult(null);

    setFileProbing(true);
    const result = await probeVideoFile(file);
    setFileProbeResult(result);
    setFileProbing(false);
  };

  const sourcePicker = (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="player-toolbar" style={{ justifyContent: 'center' }}>
        <button
          className={`button ${sourceTab === 'youtube' ? '' : 'button-secondary'}`}
          onClick={() => setSourceTab('youtube')}
        >
          YouTube
        </button>
        <button
          className={`button ${sourceTab === 'url' ? '' : 'button-secondary'}`}
          onClick={() => setSourceTab('url')}
        >
          Any URL
        </button>
        <button
          className={`button ${sourceTab === 'localStream' ? '' : 'button-secondary'}`}
          onClick={() => setSourceTab('localStream')}
        >
          Local file
        </button>
      </div>

      {sourceTab === 'localStream' ? (
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Stream local file</span>
          <input
            type="file"
            accept="video/*,.mkv,.avi,.mov,.m4v,.webm,.ogv"
            className="input"
            style={{ padding: '8px' }}
            onChange={async (event) => {
              const file = event.target.files?.[0] || null;
              setLocalStreamFileDraft(file);
              setFileProbeResult(null);
              setSourceMessage('');
              
              if (file) {
                setFileProbing(true);
                const result = await probeVideoFile(file);
                setFileProbeResult(result);
                setFileProbing(false);
              }
            }}
          />
          {fileProbing && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              ⏳ Checking file compatibility...
            </div>
          )}
          {fileProbeResult && !fileProbeResult.success && (
            <FileError
              error={fileProbeResult.error || ''}
              ffmpegCommand={fileProbeResult.ffmpegCommand}
              onDismiss={() => {
                setLocalStreamFileDraft(null);
                setFileProbeResult(null);
              }}
            />
          )}
          {localStreamFileDraft && fileProbeResult?.success && (
            <div style={{ fontSize: '0.8rem', color: 'var(--primary)', overflowWrap: 'anywhere' }}>
              ✓ {localStreamFileDraft.name} · {formatFileSize(localStreamFileDraft.size)} ·{' '}
              {formatDuration(fileProbeResult.metadata?.duration || 0)} ·{' '}
              {formatDimensions(fileProbeResult.metadata?.width || 0, fileProbeResult.metadata?.height || 0)}
            </div>
          )}
        </label>
      ) : (
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {sourceTab === 'youtube' ? 'YouTube URL' : 'Video, stream, or embed URL'}
          </span>
          <input
            className="input"
            value={sourceUrlDraft}
            onChange={(event) => setSourceUrlDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submitSource()}
            placeholder={sourceTab === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/embed/...'}
          />
        </label>
      )}

      <button
        className="button"
        onClick={submitSource}
        disabled={sourceTab === 'localStream' && (fileProbing || !localStreamFileDraft || !fileProbeResult?.success)}
      >
        {sourceTab === 'localStream' ? 'Start streaming' : sourceTab === 'url' ? 'Play URL' : 'Play YouTube'}
      </button>
      {source && (
        <button className="button button-secondary" onClick={clearSource}>
          Clear source
        </button>
      )}
      {sourceMessage && <p style={{ margin: 0, color: '#ef4444' }}>{sourceMessage}</p>}
    </div>
  );

  if (!room && loadError) {
    return (
      <div className="center-screen">
        <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="label-tag" style={{ marginBottom: '12px' }}>Room unavailable</div>
          <h2>Could not join this room</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{loadError}</p>
          <button className="button" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="center-screen">
        <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="label-tag" style={{ marginBottom: '12px' }}>Loading</div>
          <h2>Joining Room...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Preparing your watch party experience.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="room-page">
      {connectionToast && (
        <div className="card glass" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, padding: '10px 14px' }}>
          {connectionToast}
        </div>
      )}

      <div className="card glass room-header">
        <div className="room-title-block">
          {editingTitle ? (
            <input
              className="input"
              value={titleDraft}
              autoFocus
              maxLength={60}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTitle();
                if (event.key === 'Escape') {
                  setEditingTitle(false);
                  setTitleDraft(room.title || 'Untitled room');
                }
              }}
              style={{ marginBottom: 6 }}
            />
          ) : (
            <h1
              onClick={() => canEditTitle && setEditingTitle(true)}
              title={canEditTitle ? 'Edit room title' : undefined}
              style={{ margin: '0 0 4px', fontSize: '1.4rem', cursor: canEditTitle ? 'text' : 'default' }}
            >
              {room.title || 'Untitled room'}
            </h1>
          )}
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Code:&nbsp;
            <span style={{ color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.08em' }}>{room.code}</span>
            {isHost && (
              <span style={{ marginLeft: '10px', color: '#f59e0b', fontSize: '0.78rem', background: 'rgba(245,158,11,0.1)', padding: '2px 7px', borderRadius: '5px' }}>
                HOST
              </span>
            )}
          </p>
        </div>

        <div className="room-actions">
          <button className="button button-secondary" onClick={copyInviteLink}>
            {copied ? 'Copied' : 'Invite link'}
          </button>
          {canChangeSource && (
            <button className="button button-secondary" onClick={() => openSourcePicker(source?.type === 'localStream' ? 'localStream' : source?.type === 'url' ? 'url' : 'youtube')}>
              Change Source
            </button>
          )}
          <button
            className="button button-secondary"
            onClick={() => setShowCall((value) => !value)}
            style={{ background: showCall ? 'var(--surface-3)' : undefined }}
          >
            {showCall ? 'Hide call' : 'Video call'}
          </button>
          <span className="source-label">
            Source: {(activeSourceType || 'no source').replace(/([a-z])([A-Z])/g, '$1 $2')}
          </span>
          <button className="button button-secondary" onClick={leaveRoom}>
            Leave
          </button>
          {canChangeSource && (
            <button className="button" onClick={endRoom} style={{ background: '#ef4444' }}>
              End Room
            </button>
          )}
        </div>
      </div>

      {isOwnerOrAdmin && (
        <div className="card glass" style={{ display: 'grid', gap: 12 }}>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>Guest permissions</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Let guests help run the room without making them admins.
            </p>
          </div>
          <div className="player-toolbar">
            <button
              className={`button ${room.permissions?.changeSource === 'all' ? '' : 'button-secondary'}`}
              onClick={() => toggleGuestPermission('changeSource')}
            >
              {room.permissions?.changeSource === 'all' ? '✓ ' : ''}Change source: {room.permissions?.changeSource === 'all' ? 'Guests' : 'Admins'}
            </button>
            <button
              className={`button ${room.permissions?.controlPlayback === 'all' ? '' : 'button-secondary'}`}
              onClick={() => toggleGuestPermission('controlPlayback')}
            >
              {room.permissions?.controlPlayback === 'all' ? '✓ ' : ''}Playback: {room.permissions?.controlPlayback === 'all' ? 'Guests' : 'Admins'}
            </button>
            <button
              className={`button ${room.permissions?.editTitle === 'all' ? '' : 'button-secondary'}`}
              onClick={() => toggleGuestPermission('editTitle')}
            >
              {room.permissions?.editTitle === 'all' ? '✓ ' : ''}Title: {room.permissions?.editTitle === 'all' ? 'Guests' : 'Admins'}
            </button>
          </div>
        </div>
      )}

      <div className={`row room-watch-layout ${showCall ? 'has-call' : ''}`}>
        <div
          className="content-column watch-column"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileDropped(file);
          }}
        >
          <div className="watch-stage" data-watch-stage>
            {activeSourceType ? (
              <RoomPlayer
                roomCode={code}
                videoUrl={activeSourceUrl}
                sourceType={activeSourceType}
                sourceData={activeSourceData}
                localStreamFile={localStreamFile}
                isHost={playerCanControl}
                currentUserId={guestId}
                onLocalStreamStopped={() => {
                  setLocalStreamFile(null);
                  setStreamNotice('Host ended the stream.');
                }}
              />
            ) : (
              <div className="card glass" style={{ minHeight: 360, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32 }}>
                <div style={{ maxWidth: 460 }}>
                  <div className="label-tag" style={{ marginBottom: 12 }}>Empty room</div>
                  <h2 style={{ margin: '0 0 10px' }}>Nothing is playing yet</h2>
                  {canChangeSource ? (
                    <>
                      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)' }}>
                        Pick something to start the watch party.
                      </p>
                      <div className="player-toolbar" style={{ justifyContent: 'center' }}>
                        <button className="button" onClick={() => openSourcePicker('youtube')}>
                          Paste YouTube URL
                        </button>
                        <button className="button button-secondary" onClick={() => openSourcePicker('url')}>
                          Paste any URL
                        </button>
                        <button className="button button-secondary" onClick={() => openSourcePicker('localStream')}>
                          Play local file
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                      Waiting for the host to pick something...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {source && (
            <div className="card glass">
              <h3 style={{ margin: '0 0 8px' }}>Now Watching</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {source.type === 'localStream'
                  ? `${source.fileName || 'Local stream'} (${formatFileSize(source.sizeBytes)}, ${formatDuration(source.durationSec)})`
                  : source.url}
              </p>
              {streamNotice && (
                <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {streamNotice}
                </p>
              )}
              {!canChangeSource && (
                <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {source.type === 'localStream'
                    ? 'The stream is controlled by the host.'
                    : 'The host controls playback. Heartbeats keep this player in sync.'}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="content-column room-side-column">
          {showCall && (
            <VideoCallPanel
              roomCode={code}
              currentUser={{ id: guestId || userName, name: userName }}
              publishMediaAudio={isHost || isLocalStreamer}
            />
          )}

          <ChatBox
            roomCode={code}
            currentUserName={userName}
            initialMessages={messages}
          />

          <UserList
            initialParticipants={presenceMembers}
            hostUserId={room.ownerGuestId}
            currentUserEmail={guestId}
            roomCode={code}
            isStreaming={source?.type === 'localStream'}
          />
        </div>
      </div>

      {showSourceModal && (
        <div className="modal-backdrop">
          <div className="card glass modal-card">
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Change Source</h3>
              <button className="button button-secondary" onClick={() => setShowSourceModal(false)} style={{ width: 'auto', padding: '6px 10px' }}>
                Close
              </button>
            </div>
            {sourcePicker}
          </div>
        </div>
      )}
    </div>
  );
}
