'use client';

import { useWebRtcRoom } from '@/hooks/useWebRtcRoom';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { StreamVideo } from '@/components/StreamVideo';
import { QrPairing } from '@/components/QrPairing';

type ViewerViewProps = {
  signalingUrl: string;
};

export function ViewerView({ signalingUrl }: ViewerViewProps) {
  const rtc = useWebRtcRoom({ role: 'viewer', signalingUrl });

  return (
    <main className="grid">
      <h1>Desktop Viewer</h1>
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
      <QrPairing roomId={rtc.roomId} />
      <StreamVideo stream={rtc.remoteStream} label="Remote Stream" />
    </main>
  );
}
