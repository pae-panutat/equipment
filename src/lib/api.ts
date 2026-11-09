import { API_PREFIX } from "@shared/index";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** GET a JSON endpoint. Errors are thrown (never turned into empty/zero data). */
export async function apiGet<T>(path: string, params?: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const res = await fetch(`${API_PREFIX}${path}${qs.size ? `?${qs}` : ""}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    let message = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    try {
      message = (await res.json())?.error?.message ?? message;
    } catch {
      /* keep default */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}
