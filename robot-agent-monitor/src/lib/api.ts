import type { Resources, VlaModel, VlaStatus } from "./types";

export const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL!;
const vlaUploadBase = process.env.NEXT_PUBLIC_VLA_UPLOAD_URL || baseUrl;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function parseErrorMessage(body: unknown, status: number): string {
  const detail =
    body && typeof body === "object" && "message" in body
      ? (body as { message: string | string[] }).message
      : null;
  const fallback = `Backend request failed (${status})`;
  if (detail) {
    return Array.isArray(detail) ? detail.join(" · ") : detail;
  }
  if (typeof body === "string" && body.length > 0 && body.length < 300) {
    return body;
  }
  return fallback;
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
    throw new ApiError(parseErrorMessage(body, response.status), response.status);
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

export const vlaModels = {
  list(
    params: { configurationId?: number | null; q?: string } = {},
    signal?: AbortSignal,
  ): Promise<VlaModel[]> {
    const search = new URLSearchParams();
    if (params.configurationId) {
      search.set("robotConfigurationId", String(params.configurationId));
    }
    if (params.q && params.q.trim()) {
      search.set("q", params.q.trim());
    }
    const qs = search.toString();
    return request<VlaModel[]>(`/api/vla/models${qs ? `?${qs}` : ""}`, {
      signal,
    });
  },
  get(id: number, signal?: AbortSignal): Promise<VlaModel> {
    return request<VlaModel>(`/api/vla/models/${id}`, { signal });
  },
  update(
    id: number,
    data: { displayName?: string; description?: string },
  ): Promise<VlaModel> {
    return request<VlaModel>(`/api/vla/models/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  remove(id: number): Promise<{ deleted: boolean; id: number }> {
    return request<{ deleted: boolean; id: number }>(`/api/vla/models/${id}`, {
      method: "DELETE",
    });
  },
  status(signal?: AbortSignal): Promise<VlaStatus> {
    return request<VlaStatus>("/api/vla/status", { signal });
  },
};

export function uploadVlaPackage(
  configId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<VlaModel> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${vlaUploadBase}/api/vla/models`);
    xhr.timeout = 0;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      const text = xhr.responseText;
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(body as VlaModel);
      } else {
        reject(new ApiError(parseErrorMessage(body, xhr.status), xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError("Network error while uploading VLA package", 0));
    };

    xhr.onabort = () => {
      reject(new ApiError("VLA package upload was cancelled", 0));
    };

    const form = new FormData();
    form.append("robotConfigurationId", String(configId));
    form.append("package", file, file.name);
    xhr.send(form);
  });
}
