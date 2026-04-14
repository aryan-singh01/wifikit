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
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-card">
      <p>{label}</p>
      <video ref={ref} autoPlay playsInline muted={muted} className={mirrored ? 'mirror' : ''} />
    </div>
  );
}
