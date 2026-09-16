import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import {
  SOCKET_EVENTS,
  type Intent,
  type Participant,
  type RejectionCode,
  type RoomState,
  type ServerEvent,
} from '../shared/protocol.js';

const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3001';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export interface RoomView {
  status: ConnectionStatus;
  state: RoomState | null;
  you: Participant | null;
  lastRejection: RejectionCode | null;
  moveToken: (tokenId: string, x: number, y: number) => void;
}

/**
 * Owns the socket lifecycle and applies server events to local state.
 *
 * Moves are rendered optimistically and rolled back if the server rejects
 * them — the server, not this hook, decides what is true (FR-SYNC-01).
 */
export function useRoom(): RoomView {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [state, setState] = useState<RoomState | null>(null);
  const [you, setYou] = useState<Participant | null>(null);
  const [lastRejection, setLastRejection] = useState<RejectionCode | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const confirmedRef = useRef<RoomState | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('reconnecting'));

    socket.on(SOCKET_EVENTS.event, (event: ServerEvent) => {
      if (event.type === 'state:snapshot') {
        // FR-PL-06: a snapshot always replaces local state wholesale.
        confirmedRef.current = event.state;
        setState(event.state);
        setYou(event.you);
        return;
      }

      if (event.type === 'token:moved') {
        setState((prev) => {
          if (!prev) return prev;
          const token = prev.tokens[event.tokenId];
          if (!token) return prev;
          const next: RoomState = {
            ...prev,
            seq: event.seq,
            tokens: { ...prev.tokens, [event.tokenId]: { ...token, x: event.x, y: event.y } },
          };
          confirmedRef.current = next;
          return next;
        });
        return;
      }

      // Rejected: discard the optimistic render and fall back to the last
      // state the server confirmed.
      setLastRejection(event.code);
      setState(confirmedRef.current);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const moveToken = useCallback((tokenId: string, x: number, y: number) => {
    setLastRejection(null);

    setState((prev) => {
      if (!prev) return prev;
      const token = prev.tokens[tokenId];
      if (!token) return prev;
      return { ...prev, tokens: { ...prev.tokens, [tokenId]: { ...token, x, y } } };
    });

    const intent: Intent = { type: 'token:move', tokenId, x, y };
    socketRef.current?.emit(SOCKET_EVENTS.intent, intent);
  }, []);

  return { status, state, you, lastRejection, moveToken };
}
