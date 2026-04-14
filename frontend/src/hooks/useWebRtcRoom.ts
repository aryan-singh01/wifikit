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

const senderOfferNeeded = (state: RTCPeerConnectionState) =>
  state === 'new' || state === 'connecting' || state === 'disconnected';

export function useWebRtcRoom({ role, signalingUrl }: UseWebRtcRoomOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const statsTimerRef = useRef<number | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // ─── Refs that shadow state so async callbacks always read current values ───
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
  const [fps, setFps] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string>('—');

  // Keep refs in sync with state
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

  const closePeerConnection = useCallback(() => {
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    if (otherPeerIdRef.current) {
      peerConnectionsRef.current.get(otherPeerIdRef.current)?.close();
      peerConnectionsRef.current.delete(otherPeerIdRef.current);
    }
    pendingIceCandidatesRef.current = [];
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
    setFps(null);
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
        if (pc.connectionState === 'connected') {
          setStatusBoth('streaming');
          setIsStreamingBoth(true);
          if (role === 'sender') attachStats();
        }
      };

      if (role === 'viewer') {
        const remote = new MediaStream();
        remoteStreamRef.current = remote;
        pc.ontrack = (e) => {
          e.streams[0].getTracks().forEach((t) => remote.addTrack(t));
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
        setError('Camera stream unavailable. Start stream first.');
        return;
      }

      localStreamRef.current.getTracks().forEach((track) => {
        if (!pc.getSenders().find((s) => s.track?.id === track.id)) {
          pc.addTrack(track, localStreamRef.current as MediaStream);
        }
      });

      const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      console.log('📤 Sending OFFER to:', targetPeerId);
      sendSignal(targetPeerId, 'offer', offer);
    },
    [createPeerConnection, role, sendSignal]
  );

  const joinRoom = useCallback(() => {
    // ✅ Guard: never open a second socket
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

        if (role === 'sender' && firstPeer) {
          const state = peerConnectionsRef.current.get(firstPeer)?.connectionState;
          if (!state || senderOfferNeeded(state)) {
            await createAndSendOffer(firstPeer);
          }
        }
        return;
      }

      if (message.type === 'peer-left') {
        // ✅ Read from ref, not stale closure
        if (message.peerId === otherPeerIdRef.current) {
          closePeerConnection();
          setOtherPeerIdBoth(null);
          // ✅ Read isStreaming from ref
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
          await pc.setRemoteDescription(
            new RTCSessionDescription(message.data as RTCSessionDescriptionInit)
          );
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
        setStatusBoth('error');
      }
    };

    ws.onerror = () => {
      setStatusBoth('error');
      setError('Failed to connect to signaling server.');
    };

    ws.onclose = () => {
      // ✅ Read from ref, not stale closure
      if (statusRef.current !== 'stopped') {
        setStatusBoth('idle');
      }
    };
  // ✅ No volatile state deps (status, isStreaming, otherPeerId removed)
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

      // ✅ Read from ref
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
    setFps(null);
  }, [closePeerConnection, role, setIsStreamingBoth, setStatusBoth, stopLocalTracks]);

  const toggleCamera = useCallback(async () => {
    if (role !== 'sender') return;
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);

    if (!isStreamingRef.current) return;  // ✅ ref instead of state

    stopLocalTracks();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: next }
    });
    localStreamRef.current = stream;

    const sender = otherPeerIdRef.current ? peerConnectionsRef.current.get(otherPeerIdRef.current)?.getSenders().find((s) => s.track?.kind === 'video') : undefined;
    const [track] = stream.getVideoTracks();
    if (sender && track) await sender.replaceTrack(track);

    const settings = track?.getSettings();
    if (settings?.width && settings?.height) {
      setResolution(`${settings.width}x${settings.height}`);
    }
  }, [facingMode, role, stopLocalTracks]);

  useEffect(() => () => disconnect(), [disconnect]);

  const remoteStream = useMemo(() => remoteStreamRef.current, [status, otherPeerId]);
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
  };
}