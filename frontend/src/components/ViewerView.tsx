'use client';

import { useWebRtcRoom } from '@/hooks/useWebRtcRoom';
import { StreamVideo } from '@/components/StreamVideo';
import { QrPairing } from '@/components/QrPairing';

type ViewerViewProps = {
  signalingUrl: string;
  onBack?: () => void;
};

export function ViewerView({ signalingUrl, onBack }: ViewerViewProps) {
  const rtc = useWebRtcRoom({ role: 'viewer', signalingUrl });

  return (
    <div className="grid-layout">
      <div className="back-row">
        <div>
          <div className="view-title">Viewer</div>
          <div className="view-sub">Laptop / desktop monitor</div>
        </div>
        {onBack ? (
          <button type="button" className="btn sec" onClick={onBack}>
            ← Home
          </button>
        ) : null}
      </div>

      <section className="panel">
        <div className="ph">
          <h2>Room</h2>
          <span className="badge teal">Live</span>
        </div>
        <span className="field-label">Room ID</span>
        <input
          className="fake-input"
          value={rtc.roomId}
          onChange={(e) => rtc.setRoomId(e.target.value)}
          placeholder="room-01"
        />
        <div className="btn-row">
          <button type="button" className="btn" onClick={rtc.joinRoom}>
            Join
          </button>
          <button type="button" className="btn sec" onClick={rtc.disconnect}>
            Disconnect
          </button>

          <button onClick={rtc.startRecording}>
  Start Recording
</button>

<button onClick={rtc.stopRecording}>
  Stop Recording
</button>
        </div>
        <div className="readout">
          <div className="rrow">
            <span className="rkey">Status</span>
            <span className="rval active">
              <span className="dot connected" />
              {rtc.status}
            </span>
          </div>
          <div className="rrow">
            <span className="rkey">Local peer</span>
            <span className="rval">{rtc.peerId ?? '—'}</span>
          </div>
          <div className="rrow">
            <span className="rkey">Remote peer</span>
            <span className="rval amber">{rtc.otherPeerId ?? '—'}</span>
          </div>
        </div>
        {rtc.error ? <div className="err">{rtc.error}</div> : null}
      </section>

      <section className="panel">
        <div className="ph">
          <h2>Pair via QR</h2>
        </div>
        <QrPairing roomId={rtc.roomId} />
      </section>

      <StreamVideo stream={rtc.remoteStream} label="Remote Stream" live />
    </div>
  );
}
