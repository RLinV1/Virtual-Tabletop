import {
  GM_TOKEN_HEADER,
  type AssetKind,
  type GmRoomSummary,
  type GridSpec,
  type LibraryAsset,
  type LibraryUsageResponse,
} from "@vtt/shared";
import type {
  CreateRoomRequest,
  CreateRoomResponse,
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

/** A request authorized by the GM device identity (ADR 0004). */
async function gmRequest<T>(gmToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), [GM_TOKEN_HEADER]: gmToken },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (res.status === 204 ? undefined : await res.json()) as T;
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
