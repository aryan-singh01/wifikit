import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 8080);
const HEARTBEAT_INTERVAL_MS = 20_000; // ping every 20 s
const HEARTBEAT_TIMEOUT_MS  = 10_000; // kill if no pong within 10 s

const server = http.createServer((req, res) => {
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

// Send only peer-left — don't also send room-peers.
// Clients rebuild their view from peer-left alone.
function removePeer(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(peerId);

  if (room.size === 0) {
    rooms.delete(roomId);
    return;
  }

  for (const [, socket] of room) {
    send(socket, { type: 'peer-left', roomId, peerId });
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
      peers: peerIds.filter((id) => id !== peerId),
    });
  }
}

// ─── Heartbeat: detect and evict dead connections ────────────────────────────
// Each socket gets an `isAlive` flag. A setInterval pings all sockets.
// If a socket doesn't pong before the next ping, it's terminated.
wss.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPeerId = null;

  // Heartbeat state on the socket object itself
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

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

      // Clean up any previous room membership on this socket
      if (currentRoomId && currentPeerId) {
        removePeer(currentRoomId, currentPeerId);
      }

      currentRoomId = roomId;
      currentPeerId = createPeerId();

      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      rooms.get(roomId).set(currentPeerId, socket);

      send(socket, { type: 'joined-room', roomId, peerId: currentPeerId });
      broadcastRoomState(roomId); // full snapshot for everyone incl. new peer
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
        send(socket, { type: 'error', message: `Target peer ${toPeerId} is unavailable.` });
        return;
      }

      send(target, {
        type: 'signal',
        roomId: currentRoomId,
        fromPeerId: currentPeerId,
        signalType: msg.signalType,
        data: msg.data,
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

  socket.on('error', (err) => {
    console.error('Socket error', err.message);
    // 'close' will fire after 'error' — cleanup happens there
  });
});

// Global ping loop — runs independently of individual connections
const heartbeatTimer = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      // Didn't pong since last ping → assume dead, terminate
      socket.terminate(); // triggers 'close', which calls removePeer
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

// Give each socket HEARTBEAT_TIMEOUT_MS to respond before the next ping cycle.
// The interval above already handles this by checking isAlive on the NEXT tick,
// so HEARTBEAT_INTERVAL_MS itself is the effective timeout window.
// If you want a tighter timeout, use this instead:
//
// socket.pingTimeout = setTimeout(() => socket.terminate(), HEARTBEAT_TIMEOUT_MS);
// socket.on('pong', () => { clearTimeout(socket.pingTimeout); socket.isAlive = true; });

wss.on('close', () => clearInterval(heartbeatTimer));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running at ws://0.0.0.0:${PORT}`);
});