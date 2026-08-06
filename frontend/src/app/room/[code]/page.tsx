'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
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

type SourceTab = 'youtube' | 'url' | 'localStream' | 'game';
type FullscreenLayout = 'side' | 'cinema' | 'overlay';

const FRAME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/allow-x-frame-options/jfjdfokifdlmbkbncmcfbcobggohdnif';
const FRAME_HELPER_READY_KEY = 'watchparty.frameHelperReady';
const FULLSCREEN_LAYOUT_KEY = 'watchparty.fullscreenLayout';

function isDirectMediaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8|mpd)(?:$|[?#])/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

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
  const [showFrameHelperSetup, setShowFrameHelperSetup] = useState(false);
  const [frameHelperReady, setFrameHelperReady] = useState(false);
  const [pendingEmbedUrl, setPendingEmbedUrl] = useState('');
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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting'>(socket.connected ? 'connected' : 'connecting');
  const [loadError, setLoadError] = useState('');
  const [fullscreenLayout, setFullscreenLayout] = useState<FullscreenLayout>('side');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const watchLayoutRef = useRef<HTMLDivElement | null>(null);

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
  const activeSourceUrl = source?.type === 'youtube' || source?.type === 'url' || source?.type === 'game' ? source.url : undefined;

  useEffect(() => {
    setFrameHelperReady(window.localStorage.getItem(FRAME_HELPER_READY_KEY) === 'true');
  }, []);

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
      setConnectionStatus('reconnecting');
      setConnectionToast('Connection lost - reconnecting...');
    };
    const handleConnect = () => setConnectionStatus('connected');
    const handleReconnect = () => {
      setConnectionStatus('connected');
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
    socket.on('connect', handleConnect);
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
      socket.off('connect', handleConnect);
      socket.io.off('reconnect', handleReconnect);
    };
  }, [code, guestId, router, userName]);

  useEffect(() => {
    const saved = window.localStorage.getItem(FULLSCREEN_LAYOUT_KEY);
    if (saved === 'side' || saved === 'cinema' || saved === 'overlay') setFullscreenLayout(saved);

    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === watchLayoutRef.current);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.fullscreenElement !== watchLayoutRef.current) return;
      if (event.key === '1') setFullscreenMode('side');
      if (event.key === '2') setFullscreenMode('cinema');
      if (event.key === '3') setFullscreenMode('overlay');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
    if (!isOwnerOrAdmin) return;
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
    if (sourceTab === 'game') {
      socket.emit('room:setSource', { type: 'game', gameId: 'hyperion' });
      setLocalStreamFile(null);
      setShowSourceModal(false);
      return;
    }

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

    if (sourceTab === 'url' && !isDirectMediaUrl(url) && !frameHelperReady) {
      setPendingEmbedUrl(url);
      setShowFrameHelperSetup(true);
      setSourceMessage('Enable the frame helper once, then WatchParty will continue this URL.');
      return;
    }

    playUrlSource(url, sourceTab);
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

  const detectUrlSourceTab = (url: string): SourceTab => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      return host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com'
        ? 'youtube'
        : 'url';
    } catch {
      return sourceTab;
    }
  };

  const playUrlSource = (url: string, tab = detectUrlSourceTab(url)) => {
    if (!canChangeSource) return;
    socket.emit('room:setSource', { type: tab, url });
    setSourceTab(tab);
    setSourceUrlDraft(url);
    setLocalStreamFile(null);
    setShowSourceModal(false);
    setSourceMessage('');
  };

  const setFullscreenMode = (mode: FullscreenLayout) => {
    setFullscreenLayout(mode);
    window.localStorage.setItem(FULLSCREEN_LAYOUT_KEY, mode);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => null);
      return;
    }
    await watchLayoutRef.current?.requestFullscreen?.().catch(() => null);
  };

  const openFrameExtensionPage = () => {
    setShowFrameHelperSetup(true);
    setSourceMessage('Install or enable the helper, then return here and confirm it is ready.');
    window.open(FRAME_EXTENSION_URL, '_blank', 'noopener,noreferrer');
  };

  const confirmFrameHelperReady = () => {
    window.localStorage.setItem(FRAME_HELPER_READY_KEY, 'true');
    setFrameHelperReady(true);
    setShowFrameHelperSetup(false);
    setSourceMessage('Frame helper enabled for page embeds.');
    if (pendingEmbedUrl) {
      playUrlSource(pendingEmbedUrl, 'url');
      setPendingEmbedUrl('');
    }
  };

  const resetFrameHelper = () => {
    window.localStorage.removeItem(FRAME_HELPER_READY_KEY);
    setFrameHelperReady(false);
    setPendingEmbedUrl(sourceUrlDraft.trim());
    setShowFrameHelperSetup(true);
  };

  const handleSourceUrlPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedUrl = event.clipboardData.getData('text').trim();
    try {
      const parsed = new URL(pastedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      event.preventDefault();
      const normalizedUrl = parsed.toString();
      const tab = detectUrlSourceTab(normalizedUrl);
      setSourceUrlDraft(normalizedUrl);
      setSourceTab(tab);
      if (tab === 'url' && !isDirectMediaUrl(normalizedUrl) && !frameHelperReady) {
        setPendingEmbedUrl(normalizedUrl);
        setShowFrameHelperSetup(true);
        setSourceMessage('Enable the frame helper once, then WatchParty will continue this URL.');
        return;
      }
      playUrlSource(normalizedUrl, tab);
    } catch {
      // Ignore non-URL clipboard text.
    }
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
        <button
          className={`button ${sourceTab === 'game' ? '' : 'button-secondary'}`}
          onClick={() => setSourceTab('game')}
        >
          Hyperion
        </button>
      </div>

      {sourceTab === 'game' ? (
        <div style={{ display: 'grid', gap: 8, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--text)' }}>HYPERION.EXE</strong>
          <span>Launch the neon side-scrolling shooter inside the room. Each player controls their own local run while chat and call stay available.</span>
        </div>
      ) : sourceTab === 'localStream' ? (
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
            onPaste={handleSourceUrlPaste}
            onKeyDown={(event) => event.key === 'Enter' && submitSource()}
            placeholder={sourceTab === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/embed/...'}
          />
          {sourceTab === 'url' && (
            <div className={`frame-helper-inline ${frameHelperReady ? 'is-ready' : ''}`}>
              <span>
                {frameHelperReady
                  ? 'Frame helper marked ready. Page embeds will open with your browser extension enabled.'
                  : 'Page embeds need the Allow X-Frame-Options browser helper. WatchParty will guide you through the one-time setup.'}
              </span>
              <button type="button" className="button button-secondary" onClick={frameHelperReady ? resetFrameHelper : openFrameExtensionPage}>
                {frameHelperReady ? 'Check helper setup' : 'Set up frame helper'}
              </button>
            </div>
          )}
        </label>
      )}

      <button
        className="button"
        onClick={submitSource}
        disabled={sourceTab === 'localStream' && (fileProbing || !localStreamFileDraft || !fileProbeResult?.success)}
      >
        {sourceTab === 'localStream' ? 'Start streaming' : sourceTab === 'game' ? 'Launch Hyperion' : sourceTab === 'url' ? 'Play URL' : 'Play YouTube'}
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
        <div className="card glass" role="status" aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, padding: '10px 14px' }}>
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
          <div className={`connection-status connection-status-${connectionStatus}`} role="status" aria-live="polite">
            <span aria-hidden="true" />
            {connectionStatus === 'connected' ? 'Live and synced' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            <span className="role-divider" aria-hidden="true">•</span>
            {isOwnerOrAdmin
              ? 'You manage this room'
              : canControlPlayback && canChangeSource
                ? 'You can choose sources and control playback'
                : canChangeSource
                  ? 'You can choose what to watch'
                  : canControlPlayback
                    ? 'You can control playback'
                    : 'Host controls playback'}
          </div>
        </div>

        <div className="room-actions">
          <button className="button button-secondary" onClick={copyInviteLink} aria-live="polite">
            {copied ? 'Copied' : 'Invite link'}
          </button>
          {canChangeSource && (
            <button className="button button-secondary" onClick={() => openSourcePicker(source?.type === 'game' ? 'game' : source?.type === 'localStream' ? 'localStream' : source?.type === 'url' ? 'url' : 'youtube')}>
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
          {isOwnerOrAdmin && (
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

      <div
        ref={watchLayoutRef}
        className={`row room-watch-layout ${showCall ? 'has-call' : ''} ${isFullscreen ? `is-fullscreen fullscreen-${fullscreenLayout}` : ''}`}
      >
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
            <div className="fullscreen-layout-controls">
              <button className="button button-secondary" onClick={toggleFullscreen}>
                {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              </button>
              {isFullscreen && (
                <div className="fullscreen-mode-toggle" role="group" aria-label="Fullscreen layout">
                  <button className={fullscreenLayout === 'side' ? 'active' : ''} onClick={() => setFullscreenMode('side')}>1</button>
                  <button className={fullscreenLayout === 'cinema' ? 'active' : ''} onClick={() => setFullscreenMode('cinema')}>2</button>
                  <button className={fullscreenLayout === 'overlay' ? 'active' : ''} onClick={() => setFullscreenMode('overlay')}>3</button>
                </div>
              )}
            </div>
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
                        <button className="button button-secondary" onClick={() => openSourcePicker('game')}>
                          Launch Hyperion
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
                  : source.type === 'game'
                    ? source.title || 'HYPERION.EXE'
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
                    : source.type === 'game'
                      ? 'Hyperion runs locally for each participant.'
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
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowSourceModal(false)}>
          <div className="card glass modal-card" role="dialog" aria-modal="true" aria-labelledby="source-dialog-title">
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <h3 id="source-dialog-title" style={{ margin: 0 }}>Choose what to watch</h3>
              <button className="button button-secondary" onClick={() => setShowSourceModal(false)} style={{ width: 'auto', padding: '6px 10px' }}>
                Close
              </button>
            </div>
            {sourcePicker}
          </div>
        </div>
      )}

      {showFrameHelperSetup && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowFrameHelperSetup(false)}>
          <div className="card glass modal-card frame-helper-card" role="dialog" aria-modal="true" aria-labelledby="frame-helper-title">
            <div className="label-tag">One-time browser setup</div>
            <h2 id="frame-helper-title">Enable page embeds</h2>
            <p>
              Some providers block their pages from loading inside other websites. Chrome requires you to explicitly install and enable the Allow X-Frame-Options extension; WatchParty cannot install it silently.
            </p>
            <ol>
              <li>Open the Chrome Web Store using the button below.</li>
              <li>Select <strong>Add to Chrome</strong>, then enable the extension for this site.</li>
              <li>Return to this room and select <strong>I enabled it</strong>.</li>
            </ol>
            <div className="actions-row">
              <button className="button" onClick={openFrameExtensionPage}>Open extension page</button>
              <button className="button button-secondary" onClick={confirmFrameHelperReady}>I enabled it</button>
              <button className="button button-secondary" onClick={() => { setShowFrameHelperSetup(false); setPendingEmbedUrl(''); }}>Cancel</button>
            </div>
            <p className="frame-helper-disclaimer">
              This helper only affects frame headers. It does not bypass sign-in, subscriptions, DRM, or provider playback restrictions. Only enable it for sites you trust.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
