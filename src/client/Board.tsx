import { useState } from 'react';

import { BOARD, type Participant, type RoomState } from '../shared/protocol.js';

interface BoardProps {
  state: RoomState;
  you: Participant | null;
  onMove: (tokenId: string, x: number, y: number) => void;
}

/**
 * Plain DOM board. The production renderer is Konva on canvas (see
 * docs/DESIGN.md §3) — the heartbeat uses absolutely positioned divs on
 * purpose, so the prototype proves the sync path rather than the renderer.
 */
export function Board({ state, you, onMove }: BoardProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const cell = BOARD.cellPx;

  const canControl = (ownerId: string | null) => you?.role === 'gm' || (!!you && ownerId === you.id);

  const handleDrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / cell);
    const y = Math.floor((event.clientY - rect.top) / cell);
    onMove(dragging, x, y);
    setDragging(null);
  };

  return (
    <div
      className="board"
      style={{ width: BOARD.widthCells * cell, height: BOARD.heightCells * cell, backgroundSize: `${cell}px ${cell}px` }}
      onMouseUp={handleDrop}
      onMouseLeave={() => setDragging(null)}
    >
      {Object.values(state.tokens).map((token) => {
        const controllable = canControl(token.ownerId);
        return (
          <button
            key={token.id}
            type="button"
            className={[
              'token',
              controllable ? 'token--mine' : 'token--locked',
              token.hidden ? 'token--hidden' : '',
              dragging === token.id ? 'token--dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: token.x * cell, top: token.y * cell, width: cell, height: cell }}
            onMouseDown={() => controllable && setDragging(token.id)}
            aria-label={`${token.name}${token.hidden ? ' (hidden from players)' : ''}`}
            title={controllable ? `${token.name} — drag to move` : `${token.name} — not yours`}
          >
            <span aria-hidden="true">{token.name.charAt(0)}</span>
          </button>
        );
      })}
    </div>
  );
}
