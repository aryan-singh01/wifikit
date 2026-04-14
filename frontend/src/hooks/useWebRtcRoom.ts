'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RTC_CONFIG } from '@/lib/webrtc';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  SignalType
} from '@/types/signaling';

type Role = 'sender' | 'viewer';

type UseWebRtcRoomOptions = {
  role: Role;
  signalingUrl: string;
};

type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'joined'
  | 'streaming'
  | 'error'
  | 'stopped';

const senderOfferNeeded = (state: RTCPeerConnectionState) =>
  state === 'new' || state === 'connecting' || state === 'disconnected';

export function useWebRtcRoom({ role, signalingUrl }: UseWebRtcRoomOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const statsTimerRef = useRef<number | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [roomId, setRoomId] = useState('room-01');
  const [peerId, setPeerId] = useState<string | null>(null);
  const [otherPeerId, setOtherPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isStreaming, setIsStreaming] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string>('—');

  const sendMessage = useCallback((message: ClientToServerMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendSignal = useCallback(
    (toPeerId: string, signalType: SignalType, data: unknown) => {
      sendMessage({ type: 'signal', toPeerId, signalType, data });
    },
    [sendMessage]
  );

  const closePeerConnection = useCallback(() => {
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  const stopLocalTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    closePeerConnection();
    stopLocalTracks();
    remoteStreamRef.current = null;
    setIsStreaming(false);
    setStatus('stopped');
    setFps(null);
  }, [closePeerConnection, stopLocalTracks]);

  const attachStats = useCallback(() => {
    if (!pcRef.current || role !== 'sender') return;

    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
    }

    statsTimerRef.current = window.setInterval(async () => {
      if (!pcRef.current) return;
      const stats = await pcRef.current.getStats();
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          const asAny = report as RTCOutboundRtpStreamStats;
          if (typeof asAny.framesPerSecond === 'number') {
            setFps(Number(asAny.framesPerSecond.toFixed(1)));
          }
        }
      });
    }, 1000);
  }, [role]);

  const createPeerConnection = useCallback(
    (targetPeerId: string) => {
      if (pcRef.current) {
        return pcRef.current;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(targetPeerId, 'ice-candidate', event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('streaming');
          setIsStreaming(true);
          if (role === 'sender') attachStats();
        }
      };

      if (role === 'viewer') {
        const remote = new MediaStream();
        remoteStreamRef.current = remote;
        pc.ontrack = (event) => {
          event.streams[0].getTracks().forEach((track) => remote.addTrack(track));
        };
      }

      return pc;
    },
    [attachStats, role, sendSignal]
  );

  const createAndSendOffer = useCallback(
    async (targetPeerId: string) => {
      const pc = createPeerConnection(targetPeerId);
      if (role !== 'sender') return;

      if (!localStreamRef.current) {
        setError('Camera stream unavailable. Start stream first.');
        return;
      }

      localStreamRef.current.getTracks().forEach((track) => {
        if (!pc.getSenders().find((sender) => sender.track?.id === track.id)) {
          pc.addTrack(track, localStreamRef.current as MediaStream);
        }
      });

      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      console.log("📤 Sending OFFER to:", targetPeerId);
      sendSignal(targetPeerId, 'offer', offer);
    },
    [createPeerConnection, role, sendSignal]
  );

  const joinRoom = useCallback(() => {
    setError(null);
    setStatus('connecting');
    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WS connected");
      sendMessage({ type: 'join-room', roomId });
    };

    ws.onmessage = async (evt) => {
      const message = JSON.parse(evt.data) as ServerToClientMessage;

      if (message.type === 'joined-room') {
        setPeerId(message.peerId);
        setStatus('joined');
        return;
      }

      if (message.type === 'room-peers') {
        console.log("👥 Peers in room:", message.peers);
        const firstPeer = message.peers[0] ?? null;
        setOtherPeerId(firstPeer);

        if (role === 'sender' && firstPeer) {
          const state = pcRef.current?.connectionState;
          if (!state || senderOfferNeeded(state)) {
            await createAndSendOffer(firstPeer);
          }
        }
        return;
      }

      if (message.type === 'peer-left') {
        if (message.peerId === otherPeerId) {
          closePeerConnection();
          setOtherPeerId(null);
          setIsStreaming(role === 'sender' ? isStreaming : false);
          setStatus('joined');
        }
        return;
      }

      if (message.type === 'signal') {
        setOtherPeerId(message.fromPeerId);
        const pc = createPeerConnection(message.fromPeerId);

        if (message.signalType === 'offer' && role === 'viewer') {
          console.log("📥 OFFER received from:", message.fromPeerId);
          await pc.setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit));
          // 🔥 flush ICE queue
for (const c of pendingIceCandidatesRef.current) {
  await pc.addIceCandidate(new RTCIceCandidate(c));
}
pendingIceCandidatesRef.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(message.fromPeerId, 'answer', answer);
          return;
        }

        if (message.signalType === 'answer' && role === 'sender') {
          await pc.setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit));
          // 🔥 flush ICE queue
for (const c of pendingIceCandidatesRef.current) {
  await pc.addIceCandidate(new RTCIceCandidate(c));
}
pendingIceCandidatesRef.current = [];
          return;
        }

        if (message.signalType === 'ice-candidate') {
  const candidate = message.data as RTCIceCandidateInit;

  if (pc.remoteDescription) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } else {
    pendingIceCandidatesRef.current.push(candidate);
  }
}
        return;
      }

      if (message.type === 'error') {
        setError(message.message);
        setStatus('error');
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setError('Failed to connect to signaling server.');
    };

    ws.onclose = () => {
      if (status !== 'stopped') {
        setStatus('idle');
      }
    };
  }, [closePeerConnection, createAndSendOffer, createPeerConnection, isStreaming, otherPeerId, role, roomId, sendMessage, sendSignal, signalingUrl, status]);

  const disconnect = useCallback(() => {
    stopAll();
    wsRef.current?.close();
    wsRef.current = null;
    setPeerId(null);
    setOtherPeerId(null);
  }, [stopAll]);

  const startStreaming = useCallback(async () => {
    if (role !== 'sender') return;

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });
      localStreamRef.current = stream;
      const [videoTrack] = stream.getVideoTracks();
      const settings = videoTrack?.getSettings();
      if (settings?.width && settings?.height) {
        setResolution(`${settings.width}x${settings.height}`);
      }
      setIsStreaming(true);

      if (otherPeerId) {
        await createAndSendOffer(otherPeerId);
        console.log("🎥 Stream started, sending offer to:", otherPeerId);
      }
    }  catch (err) {
  console.error('getUserMedia error:', err);
  setError(`Camera error: ${(err as Error).message}`);
  setStatus('error');
}
  }, [createAndSendOffer, facingMode, otherPeerId, role]);

  const stopStreaming = useCallback(() => {
    if (role !== 'sender') return;
    stopLocalTracks();
    closePeerConnection();
    setIsStreaming(false);
    setStatus('joined');
    setFps(null);
  }, [closePeerConnection, role, stopLocalTracks]);

  const toggleCamera = useCallback(async () => {
    if (role !== 'sender') return;
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);

    if (!isStreaming) return;

    stopLocalTracks();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: next }
    });
    localStreamRef.current = stream;

    const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
    const [track] = stream.getVideoTracks();
    if (sender && track) {
      await sender.replaceTrack(track);
    }

    const settings = track?.getSettings();
    if (settings?.width && settings?.height) {
      setResolution(`${settings.width}x${settings.height}`);
    }
  }, [facingMode, isStreaming, role, stopLocalTracks]);

  useEffect(() => () => disconnect(), [disconnect]);

  const remoteStream = useMemo(() => remoteStreamRef.current, [status, otherPeerId]);
  const localStream = useMemo(() => localStreamRef.current, [isStreaming, facingMode]);

  return {
    roomId,
    setRoomId,
    peerId,
    otherPeerId,
    status,
    error,
    facingMode,
    joinRoom,
    disconnect,
    startStreaming,
    stopStreaming,
    toggleCamera,
    localStream,
    remoteStream,
    isStreaming,
    fps,
    resolution
  };
}
