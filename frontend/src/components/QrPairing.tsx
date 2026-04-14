'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type QrPairingProps = {
  roomId: string;
};

export function QrPairing({ roomId }: QrPairingProps) {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(roomId, {
      margin: 1,
      width: 180
    }).then(setSrc);
  }, [roomId]);

  if (!src) return null;

  return (
    <section className="panel">
      <h2>QR Pairing</h2>
      <p>Scan on mobile to copy room ID quickly.</p>
      <img src={src} alt={`Room ID ${roomId} QR code`} />
    </section>
  );
}
