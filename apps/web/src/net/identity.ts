import type { RoomCredentials } from "@vtt/shared";

/**
 * Durable guest identity (FR-PL-02): credentials live in localStorage so a reload,
 * backgrounded tab, or dropped connection rebinds to the same participant.
 *
 * One identity per room per browser origin. A browser holding the GM's credentials for a
 * room cannot also join it as a player — that would overwrite (and lose) the GM identity.
 */
export interface StoredCredentials extends RoomCredentials {
  /** The browser's own secret (DESIGN.md §5). The server only ever stores its SHA-256. */
  guestToken: string;
  /** Only known to the GM who created the room. */
  inviteCode?: string;
}

/**
 * 32 bytes of entropy, generated here rather than handed to us by the server
 * (DESIGN.md §5). The secret never leaves this browser except as the value the
 * server hashes, so a compromised server log cannot impersonate a participant.
 */
export function newGuestToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const CRED_PREFIX = "vtt.credentials.";
const credKey = (roomId: string) => `${CRED_PREFIX}${roomId}`;
/** Maps an invite code to the room a GUEST joined through it. Never written for the GM. */
const inviteKey = (inviteCode: string) => `vtt.invite.${inviteCode}`;

export function saveCredentials(creds: StoredCredentials) {
  try {
    localStorage.setItem(credKey(creds.roomId), JSON.stringify(creds));
  } catch {
    // Storage unavailable (private mode): identity lasts only for this page load.
  }
}

export function rememberInvite(inviteCode: string, roomId: string) {
  try {
    localStorage.setItem(inviteKey(inviteCode), roomId);
  } catch {
    /* ignore */
  }
}

export function loadCredentials(roomId: string): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(credKey(roomId));
    return raw ? (JSON.parse(raw) as StoredCredentials) : null;
  } catch {
    return null;
  }
}

/**
 * Drops this browser's seat in a room after leaving it (ADR 0006), including the invite
 * shortcut, so the invite link shows the join form again instead of a dead room.
 */
export function forgetCredentials(roomId: string) {
  try {
    localStorage.removeItem(credKey(roomId));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("vtt.invite.") && localStorage.getItem(key) === roomId) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Room this browser previously joined as a guest through this invite, if any. */
export function guestRoomForInvite(inviteCode: string): string | null {
  try {
    const roomId = localStorage.getItem(inviteKey(inviteCode));
    const creds = roomId ? loadCredentials(roomId) : null;
    // Ignore entries pointing at GM credentials (written by older builds).
    return creds && !creds.inviteCode ? creds.roomId : null;
  } catch {
    return null;
  }
}

/** Room this browser created (as GM) with this invite code, if any. */
export function gmRoomForInvite(inviteCode: string): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CRED_PREFIX)) continue;
      const creds = JSON.parse(localStorage.getItem(key) ?? "null") as StoredCredentials | null;
      if (creds?.inviteCode === inviteCode) return creds.roomId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * GM device identity (ADR 0004): owns this browser's rooms and asset library until
 * accounts exist (FR-GM-01). Generated here like the guest token; the server keeps only
 * its SHA-256. Losing site data loses it — the account screens say so.
 */
const GM_KEY = "vtt.gm";

export function loadGmToken(): string | null {
  try {
    return localStorage.getItem(GM_KEY);
  } catch {
    return null;
  }
}

/**
 * Returns this browser's GM token, creating and registering one on first use. A stored
 * token the server has since forgotten is re-registered by `gmRequest` on its first 401,
 * never replaced.
 */
export async function ensureGmToken(identify: (gmToken: string) => Promise<void>): Promise<string> {
  const existing = loadGmToken();
  if (existing) return existing;
  const gmToken = newGuestToken();
  await identify(gmToken);
  try {
    localStorage.setItem(GM_KEY, gmToken);
  } catch {
    // Storage unavailable: the identity lasts for this page load only.
  }
  return gmToken;
}
