/**
 * Client-side API helper.
 * Relies on Clerk's __session cookie being sent automatically
 * for same-origin requests (no explicit token management needed).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string }
  ) {
    super(body.error);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let body: { error: string };
    try {
      body = await res.json();
    } catch {
      body = { error: res.statusText };
    }
    throw new ApiError(res.status, body);
  }

  return res.json();
}

// Typed helpers
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),

  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: "DELETE" }),
};
