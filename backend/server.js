import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 8080);

const server = http.createServer((req, res) => {
  // Railway health check
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

/** @type {Map<string, Map<string, WebSocket>>} */
const rooms = new Map();

const createPeerId = () =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const peerIds = [...room.keys()];
  for (const [peerId, socket] of room) {
    send(socket, {
      type: 'room-peers',
      roomId,
      selfId: peerId,
      peers: peerIds.filter((id) => id !== peerId)
    });
  }
}

function removePeer(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(peerId);
  for (const [, socket] of room) {
    send(socket, { type: 'peer-left', roomId, peerId });
  }

  if (room.size === 0) {
    rooms.delete(roomId);
    return;
  }

  broadcastRoomState(roomId);
}

wss.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPeerId = null;

  send(socket, { type: 'connected' });

  socket.on('message', (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', message: 'Invalid JSON payload.' });
      return;
    }

    if (msg.type === 'join-room') {
      const roomId = String(msg.roomId || '').trim();
      if (!roomId) {
        send(socket, { type: 'error', message: 'roomId is required.' });
        return;
      }

      if (currentRoomId && currentPeerId) {
        removePeer(currentRoomId, currentPeerId);
      }

      currentRoomId = roomId;
      currentPeerId = createPeerId();

      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      rooms.get(roomId).set(currentPeerId, socket);

      send(socket, {
        type: 'joined-room',
        roomId,
        peerId: currentPeerId
      });

      broadcastRoomState(roomId);
      return;
    }

    if (!currentRoomId || !currentPeerId) {
      send(socket, { type: 'error', message: 'You must join a room first.' });
      return;
    }

    if (msg.type === 'signal') {
      const toPeerId = String(msg.toPeerId || '').trim();
      const room = rooms.get(currentRoomId);
      const target = room?.get(toPeerId);

      if (!target) {
        send(socket, {
          type: 'error',
          message: `Target peer ${toPeerId} is unavailable.`
        });
        return;
      }

      send(target, {
        type: 'signal',
        roomId: currentRoomId,
        fromPeerId: currentPeerId,
        signalType: msg.signalType,
        data: msg.data
      });
      return;
    }

    send(socket, { type: 'error', message: `Unknown message type: ${msg.type}` });
  });

  socket.on('close', () => {
    if (currentRoomId && currentPeerId) {
      removePeer(currentRoomId, currentPeerId);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running at ws://0.0.0.0:${PORT}`);
});
