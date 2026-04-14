'use client';

type ConnectionPanelProps = {
  roomId: string;
  setRoomId: (value: string) => void;
  status: string;
  peerId: string | null;
  otherPeerId: string | null;
  error: string | null;
  onJoin: () => void;
  onDisconnect: () => void;
};

export function ConnectionPanel({
  roomId,
  setRoomId,
  status,
  peerId,
  otherPeerId,
  error,
  onJoin,
  onDisconnect
}: ConnectionPanelProps) {
  return (
    <section className="panel">
      <h2>Room Connection</h2>
      <label htmlFor="room-id">Room ID</label>
      <input
        id="room-id"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        placeholder="room-01"
      />
      <div className="button-row">
        <button onClick={onJoin}>Join Room</button>
        <button onClick={onDisconnect} className="secondary">
          Disconnect
        </button>
      </div>
      <ul>
        <li>Status: {status}</li>
        <li>Your peer ID: {peerId ?? '—'}</li>
        <li>Remote peer ID: {otherPeerId ?? '—'}</li>
      </ul>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
