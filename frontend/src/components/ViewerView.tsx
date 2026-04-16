'use client';

import { useWebRtcRoom } from '@/hooks/useWebRtcRoom';
import { StreamVideo } from '@/components/StreamVideo';

type ViewerViewProps = {
  signalingUrl: string;
  onBack?: () => void;
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

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
          {rtc.isRecording ? (
            <span className="badge red" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="dot connected" style={{ background: '#ff4444', boxShadow: '0 0 0 2px #ff444455', animation: 'pulse 1s infinite' }} />
              REC {formatTime(rtc.recordingTime)}
            </span>
          ) : (
            <span className="badge teal">Live</span>
          )}
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
          <button
            type="button"
            className={`btn ${rtc.isRecording ? 'sec' : ''}`}
            onClick={rtc.isRecording ? rtc.stopRecording : rtc.startRecording}
            style={rtc.isRecording ? { borderColor: '#ff4444', color: '#ff4444' } : {}}
          >
            {rtc.isRecording ? `⏹ Stop Recording` : '⏺ Record'}
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
          <div className="rrow">
            <span className="rkey">Recording</span>
            <span className="rval" style={rtc.isRecording ? { color: '#ff4444' } : {}}>
              {rtc.isRecording ? `● ${formatTime(rtc.recordingTime)}` : 'no'}
            </span>
          </div>
        </div>
        {rtc.error ? <div className="err">{rtc.error}</div> : null}
      </section>

      <StreamVideo stream={rtc.remoteStream} label="Remote Stream" live />
    </div>
  );
}