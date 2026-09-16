/**
 * Heartbeat server: Express for REST, Socket.IO for the realtime bus.
 *
 * Deliberately in-memory. Postgres, Redis, object storage and the vision
 * worker are designed in docs/DESIGN.md but not wired up here — the point of
 * the prototype is to prove the authoritative-sync path end to end, not to
 * stand up the full topology.
 */

import { createServer } from 'node:http';

import express from 'express';
import { Server } from 'socket.io';

import { SOCKET_EVENTS, type Intent, type Participant, type ServerEvent } from '../shared/protocol.js';
import { applyIntent, createRoom, filterForParticipant } from '../shared/room.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const ROOM_ID = 'demo-room';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

// Single in-memory room for the heartbeat.
let room = createRoom(ROOM_ID);
const participants = new Map<string, Participant>();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    room: room.roomId,
    seq: room.seq,
    connected: participants.size,
  });
});

io.on('connection', (socket) => {
  // First participant in the room is the GM; everyone after is a player.
  // Real guest identity (FR-PL-02) is designed in docs/DESIGN.md §6.
  const role = participants.size === 0 ? 'gm' : 'player';
  const index = participants.size;
  const actor: Participant = {
    id: role === 'gm' ? 'gm-1' : `player-${index}`,
    displayName: role === 'gm' ? 'GM' : `Player ${index}`,
    role,
  };
  participants.set(socket.id, actor);

  const send = (event: ServerEvent) => socket.emit(SOCKET_EVENTS.event, event);

  // FR-PL-06: every client starts from an authoritative snapshot, filtered
  // for what this participant is allowed to see.
  send({ type: 'state:snapshot', state: filterForParticipant(room, actor), you: actor });

  socket.on(SOCKET_EVENTS.intent, (intent: Intent) => {
    const result = applyIntent(room, actor, intent);

    if (!result.ok) {
      send({ type: 'intent:rejected', code: result.code, currentSeq: result.currentSeq });
      return;
    }

    room = result.state;

    const moved: ServerEvent = {
      type: 'token:moved',
      tokenId: result.tokenId,
      x: result.x,
      y: result.y,
      seq: result.seq,
    };

    io.emit(SOCKET_EVENTS.event, moved);
  });

  socket.on('disconnect', () => {
    participants.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[vtt] server on http://localhost:${PORT} (health: /health)`);
});
