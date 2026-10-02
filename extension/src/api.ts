import type {
  ApiErrorBody,
  DraftResponse,
  FeedbackDto,
  FeedbackRequest,
  GenerateDraftRequest,
  MeResponse,
  PollPairingResponse,
  RegenerateDraftRequest,
  StartPairingResponse,
} from "@shared/contracts";

/** An API failure translated into something the side panel can show as-is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(status: number, body: unknown, retryAfter: string | null): ApiError {
  const payload = (body ?? {}) as Partial<ApiErrorBody>;
  const code = payload.code ?? "http_error";
  const retry = retryAfter ? Number(retryAfter) : null;
  const message = (() => {
    if (status === 401) return "Your session ended. Reconnect the extension to continue.";
    if (status === 429) {
      return `${payload.error ?? "Too many requests."}${retry ? ` Try again in ${retry}s.` : ""}`;
    }
    if (status >= 500 && !payload.error) return "The server had a problem. Try again shortly.";
    return payload.error ?? `Request failed (${status}).`;
  })();
  return new ApiError(status, code, message, retry);
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);

  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const token = await options.getToken();
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, options.baseUrl), {
        method: init.method ?? "GET",
        headers: {
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiError(
        0,
        "network_error",
        `Can't reach ${new URL(options.baseUrl).host}. Check your connection and that the server is running.`
      );
    }
    if (response.status === 204) return undefined as T;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toApiError(response.status, body, response.headers.get("Retry-After"));
    return body as T;
  }

  return {
    startPairing: (clientLabel: string) =>
      request<StartPairingResponse>("/api/ext/pair/start", { method: "POST", body: { clientLabel } }),
    pollPairing: (deviceCode: string) =>
      request<PollPairingResponse>("/api/ext/pair/poll", { method: "POST", body: { deviceCode } }),
    me: () => request<MeResponse>("/api/ext/me"),
    signOut: () => request<void>("/api/ext/session", { method: "DELETE" }),
    generateDraft: (body: GenerateDraftRequest) =>
      request<DraftResponse>("/api/drafts", { method: "POST", body }),
    regenerateDraft: (draftId: string, body: RegenerateDraftRequest) =>
      request<DraftResponse>(`/api/drafts/${encodeURIComponent(draftId)}/regenerate`, { method: "POST", body }),
    updateDraft: (draftId: string, text: string) =>
      request<DraftResponse>(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "PATCH", body: { text } }),
    recordCopy: (draftId: string) =>
      request<{ copyCount: number }>(`/api/drafts/${encodeURIComponent(draftId)}/copy`, { method: "POST" }),
    sendFeedback: (draftId: string, body: FeedbackRequest) =>
      request<{ feedback: FeedbackDto }>(`/api/drafts/${encodeURIComponent(draftId)}/feedback`, {
        method: "PUT",
        body,
      }),
  };
}
