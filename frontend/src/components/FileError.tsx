'use client';

import { useState } from 'react';

interface FileErrorProps {
  error: string;
  ffmpegCommand?: string;
  onDismiss?: () => void;
}

export default function FileError({ error, ffmpegCommand, onDismiss }: FileErrorProps) {
  const [copied, setCopied] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  const handleCopyCommand = async () => {
    if (ffmpegCommand) {
      try {
        await navigator.clipboard.writeText(ffmpegCommand);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert('Failed to copy. Please copy manually.');
      }
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#3d2b2b',
        border: '1px solid #ff6b6b',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '16px',
        marginBottom: '16px',
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <div
          style={{
            color: '#ff6b6b',
            fontWeight: 'bold',
            marginBottom: '4px',
            fontSize: '14px',
          }}
        >
          ❌ {error}
        </div>
        <div
          style={{
            color: '#aaa',
            fontSize: '12px',
            lineHeight: '1.5',
          }}
        >
          {ffmpegCommand && (
            <div style={{ marginTop: '8px' }}>
              <div
                style={{
                  backgroundColor: '#1a1a1a',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  marginBottom: '8px',
                  overflow: 'auto',
                }}
              >
                {ffmpegCommand}
              </div>
              <button
                onClick={handleCopyCommand}
                style={{
                  backgroundColor: '#ff6b6b',
                  color: '#000',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginRight: '8px',
                }}
              >
                {copied ? '✓ Copied' : 'Copy Command'}
              </button>
              <button
                onClick={() => setShowExplainer(!showExplainer)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#888',
                  border: 'none',
                  padding: '6px 0',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'underline',
                }}
              >
                Why doesn't this work?
              </button>
            </div>
          )}
        </div>
      </div>

      {showExplainer && (
        <div
          style={{
            backgroundColor: '#1a1a1a',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#aaa',
            lineHeight: '1.6',
            marginTop: '12px',
          }}
        >
          <strong>Why this happens:</strong>
          <p>
            Browsers can only play video formats that both the container format AND the codec are
            supported. For example, MKV is a container that can hold H.264 video, but browsers
            don't support the MKV container itself — only the MP4 container.
          </p>
          <p>
            <strong>The solution:</strong> Use ffmpeg to move the video streams into an MP4
            container (remuxing). This doesn't re-encode, so it's fast.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Install ffmpeg:</strong>
            <br />
            macOS: <code style={{ color: '#888' }}>brew install ffmpeg</code>
            <br />
            Windows: Download from{' '}
            <a href="https://ffmpeg.org/download.html" style={{ color: '#4dabf7' }}>
              ffmpeg.org
            </a>
            <br />
            Linux: <code style={{ color: '#888' }}>sudo apt install ffmpeg</code>
          </p>
        </div>
      )}

      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            backgroundColor: 'transparent',
            color: '#888',
            border: 'none',
            padding: '0',
            cursor: 'pointer',
            fontSize: '12px',
            textDecoration: 'underline',
            marginTop: '8px',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
