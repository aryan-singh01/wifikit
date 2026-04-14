'use client';

import { SenderView } from '@/components/SenderView';
import { ViewerView } from '@/components/ViewerView';

const signalingUrl =
  process.env.NEXT_PUBLIC_SIGNALING_URL ?? '';

export default function HomePage() {
  return (
    <div>
      <header className="hero">
        <h1>WiFi Camera Streaming Kit</h1>
        <p>Open this page on phone as sender, and laptop/desktop as viewer.</p>
        <p className="meta">Signaling server: {signalingUrl}</p>
      </header>
      <section className="split">
        <SenderView signalingUrl={signalingUrl} />
        <ViewerView signalingUrl={signalingUrl} />
      </section>
    </div>
  );
}
