'use client';

import { useEffect, useRef } from 'react';

type StreamVideoProps = {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  label: string;
};

export function StreamVideo({ stream, muted = false, mirrored = false, label }: StreamVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // Assign srcObject whenever the stream reference changes
    video.srcObject = stream;

    if (!stream) return;

    // Explicitly call play() — autoPlay alone is unreliable for remote WebRTC
    // streams, especially on mobile Safari and when srcObject is set dynamically
    const tryPlay = () => {
      video.play().catch(() => {
        // Autoplay was blocked (e.g. no user gesture yet) — ignore silently.
        // The video will play once the user interacts with the page.
      });
    };

    // Play immediately if there are already tracks (e.g. stream arrived after ontrack)
    if (stream.getTracks().length > 0) {
      tryPlay();
    }

    // Also listen for tracks added later — this is the key fix.
    // The stream reference is the same object before and after ontrack fires,
    // so the effect's dep on [stream] won't re-trigger. addtrack covers that gap.
    stream.addEventListener('addtrack', tryPlay);

    return () => {
      stream.removeEventListener('addtrack', tryPlay);
    };
  }, [stream]);

  return (
    <div className="video-card">
      <p>{label}</p>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={mirrored ? 'mirror' : ''}
      />
    </div>
  );
}