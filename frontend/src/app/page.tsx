'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SenderView } from '@/components/SenderView';
import { ViewerView } from '@/components/ViewerView';

const signalingUrl =
  process.env.NEXT_PUBLIC_SIGNALING_URL ?? '';

function PageContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get('role');

  if (role === 'sender') {
    return <SenderView signalingUrl={signalingUrl} />;
  }

  if (role === 'viewer') {
    return <ViewerView signalingUrl={signalingUrl} />;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '3rem 1rem',
    }}>
      <h2 style={{ margin: 0 }}>Select your role</h2>
      <p style={{ opacity: 0.6, margin: 0, textAlign: 'center' }}>
        Open this page on each device and pick the correct role.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <a
          href="?role=sender"
          style={{
            padding: '1rem 2rem',
            background: '#1e40af',
            color: '#fff',
            borderRadius: '0.75rem',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '1.1rem',
          }}
        >
          📱 Sender (phone / camera)
        </a>
        <a
          href="?role=viewer"
          style={{
            padding: '1rem 2rem',
            background: '#065f46',
            color: '#fff',
            borderRadius: '0.75rem',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '1.1rem',
          }}
        >
          🖥️ Viewer (laptop / desktop)
        </a>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      <header className="hero">
        <h1>WiFi Camera Streaming Kit</h1>
        <p className="meta">Signaling server: {signalingUrl}</p>
      </header>
      {/*
        Suspense is required because useSearchParams() needs it in Next.js App Router.
        Without it the build will throw a missing-Suspense-boundary error.
      */}
      <Suspense fallback={<p style={{ padding: '2rem', opacity: 0.5 }}>Loading…</p>}>
        <PageContent />
      </Suspense>
    </div>
  );
}