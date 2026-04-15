export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // STUN servers are required even on LAN — many routers block
    // direct peer-to-peer without them (AP isolation, etc.)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export async function getCameraStream(facingMode: 'user' | 'environment') {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 }
    }
  });
}