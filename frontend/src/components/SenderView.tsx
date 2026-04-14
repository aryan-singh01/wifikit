'use client';

import { useWebRtcRoom } from '@/hooks/useWebRtcRoom';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { StreamVideo } from '@/components/StreamVideo';

type SenderViewProps = {
  signalingUrl: string;
};

export function SenderView({ signalingUrl }: SenderViewProps) {
  const rtc = useWebRtcRoom({ role: 'sender', signalingUrl });

  return (
    <main className="grid">
      <h1>Mobile Camera Sender</h1>
      <ConnectionPanel
        roomId={rtc.roomId}
        setRoomId={rtc.setRoomId}
        status={rtc.status}
        peerId={rtc.peerId}
        otherPeerId={rtc.otherPeerId}
        error={rtc.error}
        onJoin={rtc.joinRoom}
        onDisconnect={rtc.disconnect}
      />
      <section className="panel">
        <h2>Camera Controls</h2>
        <div className="button-row">
          <button onClick={rtc.startStreaming}>Start Stream</button>
          <button onClick={rtc.stopStreaming} className="secondary">
            Stop Stream
          </button>
          <button onClick={rtc.toggleCamera} className="secondary">
            Toggle Front/Rear
          </button>
        </div>
        <ul>
          <li>Active camera: {rtc.facingMode}</li>
          <li>Streaming: {rtc.isStreaming ? 'yes' : 'no'}</li>
          <li>Resolution: {rtc.resolution}</li>
          <li>FPS: {rtc.fps ?? '—'}</li>
        </ul>
      </section>
      <StreamVideo
        stream={rtc.localStream}
        muted
        mirrored={rtc.facingMode === 'user'}
        label="Local Preview"
      />
    </main>
  );
}
