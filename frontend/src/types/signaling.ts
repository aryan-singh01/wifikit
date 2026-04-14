export type SignalType = 'offer' | 'answer' | 'ice-candidate';

export type ClientToServerMessage =
  | {
      type: 'join-room';
      roomId: string;
    }
  | {
      type: 'signal';
      toPeerId: string;
      signalType: SignalType;
      data: unknown;
    };

export type ServerToClientMessage =
  | { type: 'connected' }
  | { type: 'joined-room'; roomId: string; peerId: string }
  | { type: 'room-peers'; roomId: string; selfId: string; peers: string[] }
  | { type: 'peer-left'; roomId: string; peerId: string }
  | {
      type: 'signal';
      roomId: string;
      fromPeerId: string;
      signalType: SignalType;
      data: unknown;
    }
  | { type: 'error'; message: string };
