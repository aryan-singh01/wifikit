export const RTC_CONFIG: RTCConfiguration = {
  iceServers: []  // LAN-only: host candidates are sufficient
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
