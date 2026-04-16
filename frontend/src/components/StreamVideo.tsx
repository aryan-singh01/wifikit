'use client';

import { useEffect, useRef } from 'react';

type StreamVideoProps = {
  stream: MediaStream | null;
  muted?: boolean;
  // mirrored?: boolean;
  label: string;
  live?: boolean;
};

export function StreamVideo({ stream, muted = false, label, live = false }: StreamVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    video.srcObject = stream;

    if (!stream) return;

    const tryPlay = () => {
      video.play().catch(() => {});
    };

    if (stream.getTracks().length > 0) {
      tryPlay();
    }

    stream.addEventListener('addtrack', tryPlay);

    // Safety net: if MediaRecorder.stop() or any other API pauses the element,
    // immediately resume — the stream itself is still live.
    const handlePause = () => {
      if (stream && stream.active) {
        video.play().catch(() => {});
      }
    };
    video.addEventListener('pause', handlePause);

    return () => {
      stream.removeEventListener('addtrack', tryPlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [stream]);

  const hasStream = Boolean(stream && stream.getTracks().length > 0);

  return (
    <div className="video-card">
      <div className="video-label">
        <span>{label}</span>
        <span className="vlive">
          <span className={`dot ${live ? 'streaming' : ''}`} />
          {live ? 'LIVE' : 'READY'}
        </span>
      </div>
      <div className="video-placeholder">
        {hasStream ? (
          <video ref={ref} autoPlay playsInline muted={muted} />
        ) : (
          <>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="8" width="20" height="16" rx="2" stroke="#3d3830" strokeWidth="1.5" />
              <path d="M22 13l8-4v14l-8-4V13z" stroke="#3d3830" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span>{label === 'Remote Stream' ? 'awaiting stream' : 'camera preview'}</span>
          </>
        )}
      </div>
    </div>
  );
}