import { useMemo } from "react";
import { navigate } from "../router";
import { knownRooms } from "../net/identity";
import { NotBuiltYet, SiteChrome } from "./SiteChrome";

/**
 * The room hub (DESIGN.md §11.7). A list, not a card grid — a list scans and a grid does
 * not — ordered by last played, because the room you want is almost always the one you
 * were just in.
 *
 * The real hub reads the rooms an account owns, which needs KAN-7. Until then this shows
 * the rooms *this browser* holds credentials for, read from localStorage. That is a
 * genuinely useful stopgap and an honest one: it is the same identity the table already
 * uses, and it disappears when you clear site data — which is exactly the limitation
 * accounts exist to remove.
 */
export function RoomsPage() {
  const rooms = useMemo(() => knownRooms(), []);

  return (
    <SiteChrome>
      <main className="rooms">
        <header className="rooms-head">
          <h1>Your rooms</h1>
          <button className="secondary" onClick={() => navigate("/")}>
            New room
          </button>
        </header>

        <NotBuiltYet ticket="KAN-7, KAN-57">
          Showing rooms this browser has joined. Signing in will show every room on your
          account, from any device.
        </NotBuiltYet>

        {rooms.length === 0 ? (
          <div className="empty">
            <h2>No rooms here yet</h2>
            <p className="muted">
              Rooms you create or join from this browser will appear here. Start one and
              invite your players with a link.
            </p>
            <button onClick={() => navigate("/")}>Create a room</button>
          </div>
        ) : (
          <ul className="plain room-list">
            {rooms.map((r) => (
              <li key={r.roomId}>
                <button className="room-row" onClick={() => navigate(`/r/${r.roomId}`)}>
                  <span className="room-thumb" aria-hidden="true" />
                  <span className="room-main">
                    <span className="room-name">{r.name ?? "Untitled room"}</span>
                    <span className="muted room-meta">
                      {r.inviteCode ? "You are the GM" : "You joined as a player"}
                    </span>
                  </span>
                  <span className="room-go" aria-hidden="true">
                    Open
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </SiteChrome>
  );
}
