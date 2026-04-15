'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type QrPairingProps = {
  roomId: string;
};

export function QrPairing({ roomId }: QrPairingProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(roomId, { margin: 1, width: 180 }).then((value) => {
      if (active) setSrc(value);
    });
    return () => {
      active = false;
    };
  }, [roomId]);

  return (
    <div className="qr-wrap">
      <div className="qr-box">
        {src ? <img src={src} alt={`Room ID ${roomId} QR code`} style={{ width: 38, height: 38 }} /> : <div className="qr-placeholder" />}
      </div>
      <div className="qr-meta">
        <p>Scan on your phone to auto-fill the room ID, then select Sender.</p>
        <span className="badge">{roomId}</span>
      </div>
    </div>
  );
}
