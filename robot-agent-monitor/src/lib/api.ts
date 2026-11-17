import type { Resources } from "./types";
export const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL!;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "message" in body
        ? (body as { message: string | string[] }).message
        : null;
    const fallback = `Backend request failed (${response.status})`;
    throw new ApiError(
      detail
        ? Array.isArray(detail)
          ? detail.join(" · ")
          : detail
        : typeof body === "string" && body.length < 180 && body
          ? body
          : fallback,
      response.status,
    );
  }
  return body as T;
}
export async function list<K extends keyof Resources>(
  resource: K,
): Promise<Resources[K]> {
  const all: Resources[K][number][] = [];
  for (let offset = 0; ; offset += 200) {
    const rows = await request<Resources[K]>(
      `/api/v1/${resource}/list?limit=200&offset=${offset}`,
    );
    all.push(...rows);
    if (rows.length < 200) break;
  }
  return all as Resources[K];
}
function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Browsers expose getRandomValues on the Jetson's HTTP LAN address.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
export function write(
  resource: string,
  operation: "create" | "update" | "delete",
  data: object,
) {
  return request<{ recordId?: number }>(`/api/v1/${resource}/${operation}`, {
    method:
      operation === "create"
        ? "POST"
        : operation === "update"
          ? "PUT"
          : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: requestId(), data }),
  });
}
