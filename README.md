# WiFiKit: LAN Real-Time Camera Streaming

A full-stack LAN-only real-time camera streaming system using:

- **Backend**: Node.js + `ws` signaling server
- **Frontend**: Next.js + React + WebRTC

It supports:

- Room-based pairing
- Mobile sender (camera capture + front/rear toggle)
- Desktop viewer (receives live stream)
- Offer/Answer/ICE signaling over WebSocket
- Optional QR pairing, start/stop stream, FPS and resolution display

## Project Structure

```text
.
├── backend/
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       └── types/
└── README.md
```

## Requirements

- Node.js 20+
- Devices connected to the same WiFi/LAN
- Browser support for WebRTC (`getUserMedia`, `RTCPeerConnection`)

## Run Backend (Signaling Server)

```bash
cd backend
npm install
npm run start
```

Default signaling endpoint:

- `ws://<YOUR_LAN_IP>:8080`

> For LAN usage, replace `localhost` with your machine's local IP (e.g., `192.168.1.25`).

## Run Frontend (Next.js)

```bash
cd frontend
npm install
NEXT_PUBLIC_SIGNALING_URL=ws://<YOUR_LAN_IP>:8080 npm run dev
```

Frontend runs on:

- `http://<YOUR_LAN_IP>:3000`

## How to Use

1. Start backend.
2. Start frontend with LAN signaling URL.
3. Open `http://<LAN_IP>:3000` on desktop (viewer) and mobile (sender).
4. Use same **Room ID** on both interfaces.
5. On mobile sender:
   - Join room
   - Start stream
   - Toggle front/rear camera if needed
6. On desktop viewer:
   - Join same room
   - Remote stream should render with low latency.

## Notes for LAN-only deployments

- This setup does not require TURN for same-network peers.
- A public STUN server is configured by default for candidate gathering.
- For completely offline environments, you can:
  - remove STUN servers, or
  - host your own local STUN service and update `frontend/src/lib/webrtc.ts`.

## Signaling protocol summary

- Client → server:
  - `join-room`
  - `signal` (`offer`, `answer`, `ice-candidate`)
- Server → client:
  - `joined-room`
  - `room-peers`
  - `peer-left`
  - forwarded `signal`

## Production-like considerations

- Keep backend behind LAN firewall only.
- Use HTTPS for camera access on mobile browsers when required.
- Add auth / room secrets for controlled access.
- Optionally split sender/viewer into dedicated routes (`/sender`, `/viewer`).
