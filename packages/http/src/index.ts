export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type HttpQueryValue = string | number | boolean | null | undefined;

export type HttpHeaders =
  | Headers
  | Record<string, string | number | boolean | null | undefined>
  | readonly [string, string][];

export interface HttpRetryPolicy {
  /** Maximum number of retry attempts after the first failed request. */
  readonly attempts: number;
  /** Delay in milliseconds before each retry. Defaults to 100ms. */
  readonly backoffMs?: number | ((attempt: number, error: HttpError) => number);
  /** Decides whether a failed request should be retried. Defaults to network errors and 5xx responses. */
  readonly shouldRetry?: (error: HttpError, attempt: number) => boolean;
}

export interface HttpRequest<TBody = unknown> {
  /** HTTP method. Defaults to GET. */
  readonly method?: HttpMethod;
  /** Path relative to baseUrl, or an absolute URL. */
  readonly path: string;
  /** Query parameters appended to the URL. */
  readonly query?: Record<string, HttpQueryValue | readonly HttpQueryValue[]>;
  /** Request headers. */
  readonly headers?: HttpHeaders;
  /** Request body. Plain objects are encoded as JSON. */
  readonly body?: TBody;
  /** Abort signal controlled by resources, routes, or actions. */
  readonly signal?: AbortSignal;
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Additional metadata for logging, signing, or devtools. */
  readonly meta?: Record<string, unknown>;
}

export interface NormalizedHttpRequest<TBody = unknown> extends HttpRequest<TBody> {
  readonly method: HttpMethod;
  readonly url: URL;
  readonly headers: Headers;
  readonly requestId: string;
}

export interface HttpResponse<TData = unknown> {
  readonly request: NormalizedHttpRequest;
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly data: TData;
  readonly raw: Response;
}

export interface HttpInterceptor {
  /** Runs before fetch. Use it for auth, request signing, tenancy, tracing, or default headers. */
  request?(request: NormalizedHttpRequest): NormalizedHttpRequest | Promise<NormalizedHttpRequest>;
  /** Runs after a successful HTTP response has been parsed. */
  response?(response: HttpResponse): HttpResponse | Promise<HttpResponse>;
  /** Runs when fetch, parsing, or non-2xx status handling fails. */
  error?(error: HttpError): HttpError | Promise<HttpError>;
}

export interface HttpClientOptions {
  /** Base URL used for relative request paths. */
  readonly baseUrl?: string;
  /** Default headers applied to every request. */
  readonly headers?: HttpHeaders | (() => HttpHeaders | Promise<HttpHeaders>);
  /** Fetch implementation. Defaults to globalThis.fetch. */
  readonly fetcher?: typeof fetch;
  /** Request/response/error interceptors. */
  readonly interceptors?: readonly HttpInterceptor[];
  /** Default timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Default retry policy. */
  readonly retry?: HttpRetryPolicy;
  /** Creates the request id header. Defaults to an incrementing Wibble id. */
  readonly createRequestId?: () => string;
}

export interface HttpClient {
  request<TData = unknown, TBody = unknown>(request: HttpRequest<TBody>): Promise<HttpResponse<TData>>;
  get<TData = unknown>(path: string, request?: Omit<HttpRequest, "method" | "path" | "body">): Promise<HttpResponse<TData>>;
  post<TData = unknown, TBody = unknown>(path: string, body?: TBody, request?: Omit<HttpRequest<TBody>, "method" | "path" | "body">): Promise<HttpResponse<TData>>;
  put<TData = unknown, TBody = unknown>(path: string, body?: TBody, request?: Omit<HttpRequest<TBody>, "method" | "path" | "body">): Promise<HttpResponse<TData>>;
  patch<TData = unknown, TBody = unknown>(path: string, body?: TBody, request?: Omit<HttpRequest<TBody>, "method" | "path" | "body">): Promise<HttpResponse<TData>>;
  delete<TData = unknown>(path: string, request?: Omit<HttpRequest, "method" | "path" | "body">): Promise<HttpResponse<TData>>;
}

export type HttpEventPhase = "start" | "success" | "retry" | "error";

export interface HttpEvent {
  readonly phase: HttpEventPhase;
  readonly method: HttpMethod;
  readonly url: string;
  readonly requestId: string;
  readonly status?: number;
  readonly detail?: unknown;
  readonly timestamp: number;
}

export type HttpEventListener = (event: HttpEvent) => void;

export interface ETagCacheEntry {
  readonly etag: string;
  readonly data: unknown;
}

const listeners = new Set<HttpEventListener>();
let requestCounter = 0;

/** Error type used for failed HTTP requests, failed parsing, and exhausted retries. */
export class HttpError extends Error {
  readonly request: NormalizedHttpRequest;
  readonly response?: HttpResponse;
  readonly status?: number;
  readonly cause: unknown;

  constructor(message: string, request: NormalizedHttpRequest, options: { response?: HttpResponse; cause?: unknown } = {}) {
    super(message);
    this.name = "HttpError";
    this.request = request;
    this.response = options.response;
    this.status = options.response?.status;
    this.cause = options.cause;
  }
}

/** Subscribes to HTTP request lifecycle events for devtools, tests, and telemetry bridges. */
export function subscribeHttpEvents(listener: HttpEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Emits a request lifecycle event. Most apps should subscribe instead of calling this directly. */
export function emitHttpEvent(event: Omit<HttpEvent, "timestamp">): void {
  const next = { ...event, timestamp: Date.now() };
  for (const listener of listeners) {
    listener(next);
  }
}

/** Creates a Wibble HTTP client suitable for resources and actions. */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new Error("createHttpClient() requires a fetch implementation.");
  }

  async function request<TData = unknown, TBody = unknown>(input: HttpRequest<TBody>): Promise<HttpResponse<TData>> {
    const retry = options.retry ?? { attempts: 0 };
    let normalized = await normalizeRequest(input, options);
    normalized = await runRequestInterceptors(normalized, options.interceptors ?? []);

    emitHttpEvent({
      phase: "start",
      method: normalized.method,
      url: normalized.url.toString(),
      requestId: normalized.requestId
    });

    let attempt = 0;
    let lastError: HttpError | undefined;

    while (attempt <= retry.attempts) {
      const abort = withTimeout(normalized.signal, normalized.timeoutMs ?? options.timeoutMs);

      try {
        const raw = await fetcher(normalized.url, {
          method: normalized.method,
          headers: normalized.headers,
          body: encodeBody(normalized),
          signal: abort.signal
        });
        abort.dispose();

        const response = await buildResponse<TData>(normalized, raw);
        if (!response.ok) {
          throw new HttpError(`HTTP ${response.status} for ${normalized.method} ${normalized.url.pathname}`, normalized, { response });
        }

        const intercepted = await runResponseInterceptors(response, options.interceptors ?? []);
        emitHttpEvent({
          phase: "success",
          method: normalized.method,
          url: normalized.url.toString(),
          requestId: normalized.requestId,
          status: intercepted.status
        });
        return intercepted as HttpResponse<TData>;
      } catch (reason) {
        abort.dispose();
        const httpError = reason instanceof HttpError
          ? reason
          : new HttpError(`Request failed for ${normalized.method} ${normalized.url.pathname}`, normalized, { cause: reason });
        lastError = await runErrorInterceptors(httpError, options.interceptors ?? []);

        if (attempt >= retry.attempts || !shouldRetry(lastError, attempt + 1, retry)) {
          emitHttpEvent({
            phase: "error",
            method: normalized.method,
            url: normalized.url.toString(),
            requestId: normalized.requestId,
            status: lastError.status,
            detail: lastError
          });
          throw lastError;
        }

        attempt += 1;
        emitHttpEvent({
          phase: "retry",
          method: normalized.method,
          url: normalized.url.toString(),
          requestId: normalized.requestId,
          status: lastError.status,
          detail: { attempt }
        });
        await delay(backoffMs(attempt, lastError, retry));
      }
    }

    throw lastError ?? new HttpError("Request failed without an error.", normalized);
  }

  return {
    request,
    get(path, requestOptions) {
      return request({ ...requestOptions, method: "GET", path });
    },
    post(path, body, requestOptions) {
      return request({ ...requestOptions, method: "POST", path, body });
    },
    put(path, body, requestOptions) {
      return request({ ...requestOptions, method: "PUT", path, body });
    },
    patch(path, body, requestOptions) {
      return request({ ...requestOptions, method: "PATCH", path, body });
    },
    delete(path, requestOptions) {
      return request({ ...requestOptions, method: "DELETE", path });
    }
  };
}

/** Creates an interceptor that applies stable request headers. */
export function headersInterceptor(headers: HttpHeaders | (() => HttpHeaders | Promise<HttpHeaders>)): HttpInterceptor {
  return {
    async request(request) {
      mergeHeaders(request.headers, typeof headers === "function" ? await headers() : headers);
      return request;
    }
  };
}

/** Creates an interceptor for conditional requests backed by ETag response headers. */
export function eTagCacheInterceptor(cache = new Map<string, ETagCacheEntry>()): HttpInterceptor {
  return {
    request(request) {
      const entry = cache.get(cacheKey(request));
      if (entry) {
        request.headers.set("if-none-match", entry.etag);
      }
      return request;
    },
    response(response) {
      const key = cacheKey(response.request);
      if (response.status === 304) {
        const cached = cache.get(key);
        if (cached) {
          return { ...response, status: 200, ok: true, data: cached.data };
        }
      }

      const etag = response.headers.get("etag");
      if (etag) {
        cache.set(key, { etag, data: response.data });
      }
      return response;
    }
  };
}

async function normalizeRequest<TBody>(
  request: HttpRequest<TBody>,
  options: HttpClientOptions
): Promise<NormalizedHttpRequest<TBody>> {
  const method = request.method ?? "GET";
  const baseUrl = options.baseUrl ?? (typeof window === "undefined" ? "http://localhost" : window.location.origin);
  const url = new URL(request.path, baseUrl);

  for (const [key, value] of Object.entries(request.query ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item != null) {
        url.searchParams.append(key, String(item));
      }
    }
  }

  const headers = new Headers();
  mergeHeaders(headers, typeof options.headers === "function" ? await options.headers() : options.headers);
  mergeHeaders(headers, request.headers);

  const requestId = options.createRequestId?.() ?? `wibble-${++requestCounter}`;
  if (!headers.has("x-wibble-request-id")) {
    headers.set("x-wibble-request-id", requestId);
  }

  return {
    ...request,
    method,
    url,
    headers,
    requestId
  };
}

function mergeHeaders(target: Headers, source: HttpHeaders | undefined): void {
  if (!source) {
    return;
  }

  if (source instanceof Headers) {
    source.forEach((value, key) => target.set(key, value));
    return;
  }

  if (Array.isArray(source)) {
    for (const [key, value] of source) {
      target.set(key, value);
    }
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (value != null) {
      target.set(key, String(value));
    }
  }
}

function encodeBody(request: NormalizedHttpRequest): BodyInit | undefined {
  const body = request.body;
  if (body == null || request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }

  if (!request.headers.has("content-type")) {
    request.headers.set("content-type", "application/json");
  }
  return JSON.stringify(body);
}

async function buildResponse<TData>(request: NormalizedHttpRequest, raw: Response): Promise<HttpResponse<TData>> {
  const contentType = raw.headers.get("content-type") ?? "";
  const data = raw.status === 204 || raw.status === 304
    ? undefined
    : contentType.includes("application/json")
      ? await raw.json()
      : await raw.text();

  return {
    request,
    status: raw.status,
    ok: raw.ok || raw.status === 304,
    headers: raw.headers,
    data: data as TData,
    raw
  };
}

async function runRequestInterceptors<TBody>(
  request: NormalizedHttpRequest<TBody>,
  interceptors: readonly HttpInterceptor[]
): Promise<NormalizedHttpRequest<TBody>> {
  let next = request;
  for (const interceptor of interceptors) {
    const intercepted = await interceptor.request?.(next);
    next = (intercepted ?? next) as NormalizedHttpRequest<TBody>;
  }
  return next;
}

async function runResponseInterceptors(
  response: HttpResponse,
  interceptors: readonly HttpInterceptor[]
): Promise<HttpResponse> {
  let next = response;
  for (const interceptor of interceptors) {
    next = await interceptor.response?.(next) ?? next;
  }
  return next;
}

async function runErrorInterceptors(error: HttpError, interceptors: readonly HttpInterceptor[]): Promise<HttpError> {
  let next = error;
  for (const interceptor of interceptors) {
    next = await interceptor.error?.(next) ?? next;
  }
  return next;
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number | undefined): { signal?: AbortSignal; dispose(): void } {
  if (!timeoutMs) {
    return { signal, dispose() {} };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

function shouldRetry(error: HttpError, attempt: number, policy: HttpRetryPolicy): boolean {
  if (policy.shouldRetry) {
    return policy.shouldRetry(error, attempt);
  }

  return error.status == null || error.status >= 500;
}

function backoffMs(attempt: number, error: HttpError, policy: HttpRetryPolicy): number {
  if (typeof policy.backoffMs === "function") {
    return policy.backoffMs(attempt, error);
  }

  return (policy.backoffMs ?? 100) * attempt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(request: NormalizedHttpRequest): string {
  return `${request.method} ${request.url.toString()}`;
}
