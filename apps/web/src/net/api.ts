import {
  GM_TOKEN_HEADER,
  HistoryResponse,
  type AssetKind,
  type GmRoomSummary,
  type GridSpec,
  type LibraryAsset,
  type LibraryUsageResponse,
} from "@vtt/shared";
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  InviteResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  UploadResponse,
} from "@vtt/shared";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

/**
 * A request authorized by the GM device identity (ADR 0004).
 *
 * A 401 means the server no longer knows this token (store switched or wiped), so the
 * same token is registered again and the request retried once (gm-identity-recovery).
 * Never mint a new token here: that would orphan the rooms this one owns. `init.body`
 * is sent twice, so it must be resendable (a string or FormData, not a stream).
 */
async function gmRequest<T>(gmToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const send = () =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), [GM_TOKEN_HEADER]: gmToken },
    });
  let res = await send();
  if (res.status === 401) {
    await reidentify(gmToken);
    res = await send();
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** In-flight re-registrations, so concurrent 401s for one token share a single identify. */
const pendingIdentify = new Map<string, Promise<void>>();

function reidentify(gmToken: string): Promise<void> {
  let pending = pendingIdentify.get(gmToken);
  if (!pending) {
    pending = api.gm.identify(gmToken).finally(() => pendingIdentify.delete(gmToken));
    pendingIdentify.set(gmToken, pending);
  }
  return pending;
}

/** A room request authorized by this browser's guest credential for that room. */
async function roomRequest<T>(roomId: string, token: string, method: "GET" | "POST"): Promise<T> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/invite`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

const jsonBody = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function errorMessage(res: Response) {
  try {
    const body = await res.json();
    return typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export const api = {
  async history(roomId: string, token: string, player: string, before?: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ player });
    if (before !== undefined) query.set("before", String(before));
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/history?${query}`, {
      headers: { authorization: `Bearer ${token}` }, signal,
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return HistoryResponse.parse(await res.json());
  },

  /** The room's current invite code (FR-GM-20). GM only; the server answers 403 otherwise. */
  getInvite: (roomId: string, token: string) => roomRequest<InviteResponse>(roomId, token, "GET"),

  /** Replaces the invite code; the old link stops working at once (FR-GM-20). */
  resetInvite: (roomId: string, token: string) => roomRequest<InviteResponse>(roomId, token, "POST"),

  createRoom: (req: CreateRoomRequest) => postJson<CreateRoomResponse>("/api/rooms", req),

  joinRoom: (inviteCode: string, req: JoinRoomRequest) =>
    postJson<JoinRoomResponse>(`/api/invites/${encodeURIComponent(inviteCode)}/join`, req),

  async upload(file: File, token: string): Promise<UploadResponse> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return (await res.json()) as UploadResponse;
  },

  gm: {
    async identify(gmToken: string): Promise<void> {
      const res = await fetch("/api/gm/identify", { method: "POST", ...jsonBody({ gmToken }) });
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    rooms: (gmToken: string) => gmRequest<GmRoomSummary[]>(gmToken, "/api/gm/rooms"),

    /** Deletes an owned room and everything in it, for good (KAN-72, ADR 0009). */
    async deleteRoom(gmToken: string, roomId: string): Promise<void> {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "DELETE",
        headers: { [GM_TOKEN_HEADER]: gmToken },
      });
      // 404: already deleted (another tab, a double click). Either way it is no longer this GM's room.
      if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res));
    },
  },

  library: {
    list: (gmToken: string) => gmRequest<LibraryAsset[]>(gmToken, "/api/library"),

    upload(gmToken: string, file: File, fields: { kind: AssetKind; name: string; width: number; height: number }) {
      const form = new FormData();
      form.append("kind", fields.kind);
      form.append("name", fields.name);
      form.append("width", String(fields.width));
      form.append("height", String(fields.height));
      form.append("file", file);
      return gmRequest<LibraryAsset>(gmToken, "/api/library", { method: "POST", body: form });
    },

    update: (gmToken: string, id: string, patch: { name?: string; grid?: GridSpec }) =>
      gmRequest<LibraryAsset>(gmToken, `/api/library/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody(patch) }),

    usage: (gmToken: string, id: string) =>
      gmRequest<LibraryUsageResponse>(gmToken, `/api/library/${encodeURIComponent(id)}/usage`),

    remove: (gmToken: string, id: string) =>
      gmRequest<void>(gmToken, `/api/library/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
};
