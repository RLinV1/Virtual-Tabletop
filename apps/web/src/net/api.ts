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
};
