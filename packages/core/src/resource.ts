import { effect, getCurrentScope, signal, untracked, type Readable, type WritableSignal } from "./reactivity";

export type ResourceKey = readonly unknown[] | string | number | boolean | null;

export interface ResourceContext {
  signal: AbortSignal;
}

export interface ResourceOptions<T> {
  /** Computes the stable cache identity for this resource. */
  key: () => ResourceKey;
  /** Loads data for the current key. Receives an AbortSignal for stale requests. */
  load: (context: ResourceContext) => Promise<T>;
  /** When false, the resource stays idle until reload/invalidate is called. */
  immediate?: boolean;
  /** Milliseconds that cached data remains fresh. Defaults to 0. */
  staleTime?: number;
  /** Number of retry attempts after a failed load. Defaults to 0. */
  retry?: number;
  /** Refetches stale data when the browser window regains focus. */
  refetchOnWindowFocus?: boolean;
}

export type ResourceStatus = "idle" | "loading" | "ready" | "refreshing" | "error";

export interface Resource<T> {
  readonly data: Readable<T | undefined>;
  readonly error: Readable<unknown>;
  readonly status: Readable<ResourceStatus>;
  readonly loading: Readable<boolean>;
  readonly refreshing: Readable<boolean>;
  readonly key: Readable<string>;
  reload(): Promise<T | undefined>;
  invalidate(): Promise<T | undefined>;
}

export class ResourceError extends Error {
  readonly key: string;
  readonly cause: unknown;

  constructor(key: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ResourceError";
    this.key = key;
    this.cause = cause;
  }
}

interface Inflight<T> {
  promise: Promise<T>;
  controller: AbortController;
}

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

const inflight = new Map<string, Inflight<unknown>>();
const cache = new Map<string, CacheEntry<unknown>>();

export function stableResourceKey(key: ResourceKey): string {
  return JSON.stringify(key);
}

export function invalidateResourceCache(match?: ResourceKey | string | ((key: string) => boolean)): void {
  if (!match) {
    cache.clear();
    return;
  }

  const predicate = typeof match === "function"
    ? match
    : (key: string) => key === (typeof match === "string" ? match : stableResourceKey(match));

  for (const key of [...cache.keys()]) {
    if (predicate(key)) {
      cache.delete(key);
    }
  }
}

export function createResource<T>(options: ResourceOptions<T>): Resource<T> {
  const data = signal<T | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const status: WritableSignal<ResourceStatus> = signal(options.immediate === false ? "idle" : "loading");
  const loading = signal(status.peek() === "loading");
  const refreshing = signal(false);
  const key = signal(stableResourceKey(options.key()));
  let version = 0;
  let localController: AbortController | undefined;
  const staleTime = options.staleTime ?? 0;
  const retry = options.retry ?? 0;

  if (options.refetchOnWindowFocus && typeof window !== "undefined") {
    const onFocus = () => {
      const cached = cache.get(key.peek()) as CacheEntry<T> | undefined;
      const stale = !cached || Date.now() - cached.updatedAt > staleTime;
      if (stale) {
        void reload();
      }
    };
    window.addEventListener("focus", onFocus);
    getCurrentScope()?.add(() => window.removeEventListener("focus", onFocus));
  }

  effect(() => {
    const nextKey = stableResourceKey(options.key());
    if (key.peek() !== nextKey) {
      key.set(nextKey);
    }

    if (options.immediate !== false) {
      void reload();
    }
  });

  effect(() => {
    const nextStatus = status.get();
    loading.set(nextStatus === "loading");
    refreshing.set(nextStatus === "refreshing");
  });

  async function reload(): Promise<T | undefined> {
    const requestVersion = ++version;
    const requestKey = key.peek();
    const cached = cache.get(requestKey) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.updatedAt <= staleTime) {
      data.set(cached.data);
      status.set("ready");
      return cached.data;
    }

    localController?.abort();
    localController = new AbortController();

    error.set(undefined);
    status.set(data.peek() === undefined ? "loading" : "refreshing");

    let entry = inflight.get(requestKey) as Inflight<T> | undefined;
    if (!entry) {
      const controller = localController;
      const promise = untracked(() => loadWithRetry({ signal: controller.signal }, retry));
      entry = { controller, promise };
      inflight.set(requestKey, entry as Inflight<unknown>);
      void promise.finally(() => {
        if (inflight.get(requestKey) === entry) {
          inflight.delete(requestKey);
        }
      }).catch(() => undefined);
    }

    try {
      const result = await entry.promise;
      if (requestVersion === version) {
        cache.set(requestKey, { data: result, updatedAt: Date.now() });
        data.set(result);
        status.set("ready");
      }
      return result;
    } catch (reason) {
      if (entry.controller.signal.aborted || localController?.signal.aborted) {
        return data.peek();
      }

      if (requestVersion === version) {
        error.set(new ResourceError(requestKey, reason));
        status.set("error");
      }
      return undefined;
    }
  }

  async function loadWithRetry(context: ResourceContext, attempts: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        return await options.load(context);
      } catch (reason) {
        if (context.signal.aborted) {
          throw reason;
        }
        lastError = reason;
      }
    }

    throw lastError;
  }

  return {
    data,
    error,
    status,
    loading,
    refreshing,
    key,
    reload,
    invalidate() {
      cache.delete(key.peek());
      return reload();
    }
  };
}
