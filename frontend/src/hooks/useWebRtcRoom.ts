'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RTC_CONFIG } from '@/lib/webrtc';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  SignalType
} from '@/types/signaling';

type Role = 'sender' | 'viewer';
type UseWebRtcRoomOptions = { role: Role; signalingUrl: string };
type ConnectionStatus = 'idle' | 'connecting' | 'joined' | 'streaming' | 'error' | 'stopped';

// BUG FIX #2: Only offer for brand-new connections.
// Previously included 'connecting' and 'disconnected' — when room-peers fired
// multiple times (server broadcasts on every join), this created duplicate
// offers on the same PC → "m-line order mismatch" SDP error → connection dead.
const senderOfferNeeded = (state: RTCPeerConnectionState) =>
  state === 'new';

export function useWebRtcRoom({ role, signalingUrl }: UseWebRtcRoomOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const statsTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // BUG FIX #5: Per-peer ICE candidate buffer.
  // Previously a single shared array — candidates got mixed up across
  // connections during reconnects.
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Refs shadow state so async callbacks always read current values
  const otherPeerIdRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const statusRef = useRef<ConnectionStatus>('idle');

  const [roomId, setRoomId] = useState('room-01');
  const [peerId, setPeerId] = useState<string | null>(null);
  const [otherPeerId, setOtherPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isStreaming, setIsStreaming] = useState(false);
  const [resolution, setResolution] = useState('');
  const [fps, setFps] = useState(0);
  // BUG FIX #6: Counter forces remoteStream useMemo to re-evaluate after
  // ontrack fires and adds tracks to the MediaStream.
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);

  const setOtherPeerIdBoth = useCallback((id: string | null) => {
    otherPeerIdRef.current = id;
    setOtherPeerId(id);
  }, []);
  const setStatusBoth = useCallback((s: ConnectionStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);
  const setIsStreamingBoth = useCallback((v: boolean) => {
    isStreamingRef.current = v;
    setIsStreaming(v);
  }, []);

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

  const closePeerConnection = useCallback((peerId?: string) => {
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    if (peerId) {
      peerConnectionsRef.current.get(peerId)?.close();
      peerConnectionsRef.current.delete(peerId);
      pendingIceCandidatesRef.current.delete(peerId);
    } else {
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
    }
  }, []);

  const stopLocalTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    closePeerConnection();
    stopLocalTracks();
    remoteStreamRef.current = null;
    setIsStreamingBoth(false);
    setStatusBoth('stopped');
    setFps(0);
  }, [closePeerConnection, setIsStreamingBoth, setStatusBoth, stopLocalTracks]);

  const attachStats = useCallback(() => {
    if (!otherPeerIdRef.current || !peerConnectionsRef.current.get(otherPeerIdRef.current) || role !== 'sender') return;
    if (statsTimerRef.current) window.clearInterval(statsTimerRef.current);
    statsTimerRef.current = window.setInterval(async () => {
      if (!otherPeerIdRef.current) return;
      const pc = peerConnectionsRef.current.get(otherPeerIdRef.current);
      if (!pc) return;
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          const r = report as RTCOutboundRtpStreamStats;
          if (typeof r.framesPerSecond === 'number') {
            setFps(Number(r.framesPerSecond.toFixed(1)));
          }
        }
      });
    }, 1000);
  }, [role]);

  const startRecording = () => {
  const stream = role === 'sender' ? localStreamRef.current : remoteStreamRef.current;
  if (!stream) return;

  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp8',
  });

  chunksRef.current = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunksRef.current.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  recorder.start();
  recorderRef.current = recorder;
};

const stopRecording = () => {
  if (recorderRef.current && recorderRef.current.state !== 'inactive') {
    recorderRef.current.stop();
  }
};

  const createPeerConnection = useCallback(
    (targetPeerId: string) => {
      const existing = peerConnectionsRef.current.get(targetPeerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(targetPeerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(targetPeerId, 'ice-candidate', e.candidate.toJSON());
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        // 'disconnected' is transient — don't destroy on it, ICE may recover.
        if (state === 'failed' || state === 'closed') {
          pc.close();
          peerConnectionsRef.current.delete(targetPeerId);
        }
        if (state === 'connected') {
          setStatusBoth('streaming');
          setIsStreamingBoth(true);
          if (role === 'sender') attachStats();
        }
      };

      if (role === 'viewer') {
        const remote = new MediaStream();
        remoteStreamRef.current = remote;

        // BUG FIX #4: Use e.track directly instead of e.streams[0].getTracks().
        // e.streams[0] can be undefined in certain signaling edge cases, causing
        // a silent TypeError so tracks never get added to the stream.
        pc.ontrack = (e) => {
          const track = e.track;
          if (!remote.getTracks().find((t) => t.id === track.id)) {
            remote.addTrack(track);
            setRemoteTrackCount((n) => n + 1);
          }
        };
      }

      return pc;
    },
    [attachStats, role, sendSignal, setIsStreamingBoth, setStatusBoth]
  );

  const createAndSendOffer = useCallback(
    async (targetPeerId: string) => {
      if (role !== 'sender') return;
      const pc = createPeerConnection(targetPeerId);

      if (!localStreamRef.current) {
        // BUG FIX #3: Don't set an error here. This path is hit when room-peers
        // arrives before the user clicks "Start Stream". Just log and bail —
        // startStreaming() will call createAndSendOffer again once ready.
        console.log('ℹ️ Offer deferred — stream not started yet');
        return;
      }

      localStreamRef.current.getTracks().forEach((track) => {
        if (!pc.getSenders().find((s) => s.track?.id === track.id)) {
          pc.addTrack(track, localStreamRef.current as MediaStream);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('📤 Sending OFFER to:', targetPeerId);
      sendSignal(targetPeerId, 'offer', offer);
    },
    [createPeerConnection, role, sendSignal]
  );

  const joinRoom = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      console.warn('joinRoom called while socket already open — ignored');
      return;
    }

    setError(null);
    setStatusBoth('connecting');

    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WS connected');
      sendMessage({ type: 'join-room', roomId });
    };

    ws.onmessage = async (evt) => {
      const message = JSON.parse(evt.data) as ServerToClientMessage;

      if (message.type === 'joined-room') {
        setPeerId(message.peerId);
        setStatusBoth('joined');
        return;
      }

      if (message.type === 'room-peers') {
        console.log('👥 Peers in room:', message.peers);
        const firstPeer = message.peers[0] ?? null;
        setOtherPeerIdBoth(firstPeer);

        // BUG FIX #2 + #3: Only create an offer when ALL of these are true:
        //   1. We're the sender
        //   2. There's a peer to send to
        //   3. We're already streaming (stream is ready — avoids the misleading error)
        //   4. No active/establishing connection yet for this peer
        if (role === 'sender' && firstPeer && isStreamingRef.current) {
          const state = peerConnectionsRef.current.get(firstPeer)?.connectionState;
          if (!state || senderOfferNeeded(state)) {
            await createAndSendOffer(firstPeer);
          }
        }
        return;
      }

      if (message.type === 'peer-left') {
        if (message.peerId) {
          closePeerConnection(message.peerId);
        }
        if (message.peerId === otherPeerIdRef.current) {
          setOtherPeerIdBoth(null);
          setIsStreamingBoth(role === 'sender' ? isStreamingRef.current : false);
          setStatusBoth('joined');
        }
        return;
      }

      if (message.type === 'signal') {
        setOtherPeerIdBoth(message.fromPeerId);
        const pc = createPeerConnection(message.fromPeerId);

        if (message.signalType === 'offer' && role === 'viewer') {
          console.log('📥 OFFER received from:', message.fromPeerId);
          await pc.setRemoteDescription(
            new RTCSessionDescription(message.data as RTCSessionDescriptionInit)
          );
          const pending = pendingIceCandidatesRef.current.get(message.fromPeerId) ?? [];
          for (const c of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingIceCandidatesRef.current.delete(message.fromPeerId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(message.fromPeerId, 'answer', answer);
          return;
        }

        if (message.signalType === 'answer' && role === 'sender') {
          await pc.setRemoteDescription(
            new RTCSessionDescription(message.data as RTCSessionDescriptionInit)
          );
          const pending = pendingIceCandidatesRef.current.get(message.fromPeerId) ?? [];
          for (const c of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingIceCandidatesRef.current.delete(message.fromPeerId);
          return;
        }

        if (message.signalType === 'ice-candidate') {
          const candidate = message.data as RTCIceCandidateInit;
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            const buf = pendingIceCandidatesRef.current.get(message.fromPeerId) ?? [];
            buf.push(candidate);
            pendingIceCandidatesRef.current.set(message.fromPeerId, buf);
          }
        }
        return;
      }

      if (message.type === 'error') {
        setError(message.message);
        setStatusBoth('error');
      }
    };

    ws.onerror = () => {
      setStatusBoth('error');
      setError('Failed to connect to signaling server.');
    };

    ws.onclose = () => {
      if (statusRef.current !== 'stopped') {
        setStatusBoth('idle');
      }
    };
  }, [
    closePeerConnection,
    createAndSendOffer,
    createPeerConnection,
    role,
    roomId,
    sendMessage,
    sendSignal,
    setIsStreamingBoth,
    setOtherPeerIdBoth,
    setStatusBoth,
    signalingUrl,
  ]);

  const disconnect = useCallback(() => {
    stopAll();
    wsRef.current?.close();
    wsRef.current = null;
    setPeerId(null);
    setOtherPeerIdBoth(null);
  }, [stopAll, setOtherPeerIdBoth]);

  const startStreaming = useCallback(async () => {
    if (role !== 'sender') return;
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      });
      localStreamRef.current = stream;
      const [videoTrack] = stream.getVideoTracks();
      const settings = videoTrack?.getSettings();
      if (settings?.width && settings?.height) {
        setResolution(`${settings.width}x${settings.height}`);
      }
      setIsStreamingBoth(true);

      if (otherPeerIdRef.current) {
        await createAndSendOffer(otherPeerIdRef.current);
        console.log('🎥 Stream started, sending offer to:', otherPeerIdRef.current);
      }
    } catch (err) {
      console.error('getUserMedia error:', err);
      setError(`Camera error: ${(err as Error).message}`);
      setStatusBoth('error');
    }
  }, [createAndSendOffer, facingMode, role, setIsStreamingBoth, setStatusBoth]);

  const stopStreaming = useCallback(() => {
    if (role !== 'sender') return;
    stopLocalTracks();
    closePeerConnection();
    setIsStreamingBoth(false);
    setStatusBoth('joined');
    setFps(0);
  }, [closePeerConnection, role, setIsStreamingBoth, setStatusBoth, stopLocalTracks]);

  const toggleCamera = useCallback(async () => {
  if (role !== 'sender') return;

  const next = facingMode === 'environment' ? 'user' : 'environment';
  setFacingMode(next);

  if (!isStreamingRef.current) return;

  const oldStream = localStreamRef.current;
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: next },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
    },
  });

  const [newTrack] = newStream.getVideoTracks();
  const sender = otherPeerIdRef.current
    ? peerConnectionsRef.current
        .get(otherPeerIdRef.current)
        ?.getSenders()
        .find((s) => s.track?.kind === 'video')
    : undefined;

  if (sender && newTrack) {
    await sender.replaceTrack(newTrack);
  }

  localStreamRef.current = newStream;
  oldStream?.getTracks().forEach((t) => t.stop());

  const settings = newTrack?.getSettings();
  if (settings?.width && settings?.height) {
    setResolution(`${settings.width}x${settings.height}`);
  }
}, [facingMode, role]);

  useEffect(() => () => disconnect(), [disconnect]);

  // remoteTrackCount is in deps so this re-evaluates when ontrack fires,
  // ensuring StreamVideo receives the stream after tracks are attached.
  const remoteStream = useMemo(
    () => remoteStreamRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, otherPeerId, remoteTrackCount]
  );
  const localStream = useMemo(() => localStreamRef.current, [isStreaming, facingMode]);

  return {
    roomId, setRoomId,
    peerId, otherPeerId,
    status, error,
    facingMode,
    joinRoom, disconnect,
    startStreaming, stopStreaming, toggleCamera,
    localStream, remoteStream,
    isStreaming, fps, resolution,
    startRecording, stopRecording,
  };
}