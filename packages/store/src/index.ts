import {
  createResource,
  createContext,
  effect,
  provide,
  signal,
  useContext,
  type ContextToken,
  type Readable,
  type Resource,
  type ResourceOptions,
  type WritableSignal
} from "@wibble/core";

export type StoreState<T extends object> = {
  readonly [K in keyof T]: WritableSignal<T[K]>;
};

export type StoreStorageKind = "local" | "session";

export interface PersistentSignalOptions<T> {
  /** Storage backend. Defaults to localStorage in browsers. */
  readonly storage?: StoreStorageKind | Storage;
  /** Serializes values before writing to storage. */
  readonly serialize?: (value: T) => string;
  /** Deserializes values read from storage. */
  readonly deserialize?: (value: string) => T;
}

export interface StoreActionEvent {
  readonly store: string;
  readonly action: string;
  readonly phase: "start" | "success" | "error";
  readonly detail?: unknown;
  readonly timestamp: number;
}

export type StoreActionListener = (event: StoreActionEvent) => void;

export interface KeyedStore<TKey, TStore> {
  /** Returns a stable store instance for the given key. */
  get(key: TKey): TStore;
  /** Removes one keyed store instance. */
  delete(key: TKey): void;
  /** Clears every keyed instance. */
  clear(): void;
  /** Returns currently materialized keys. */
  keys(): TKey[];
}

export type ListStatus = "idle" | "loading" | "ready" | "refreshing" | "error" | "mutating";

export interface ListModelOptions<TItem, TNew = TItem> {
  /** Loads the canonical list. If omitted, initialItems are used. */
  readonly load?: () => Promise<readonly TItem[]>;
  /** Initial list before a loader resolves. */
  readonly initialItems?: readonly TItem[];
  /** Adds an item and returns the next list. */
  readonly add?: (current: readonly TItem[], value: TNew) => Promise<readonly TItem[]> | readonly TItem[];
  /** Updates an item and returns the next list. */
  readonly update?: (current: readonly TItem[], value: TItem) => Promise<readonly TItem[]> | readonly TItem[];
  /** Removes an item and returns the next list. */
  readonly remove?: (current: readonly TItem[], value: TItem) => Promise<readonly TItem[]> | readonly TItem[];
  /** Starts loading immediately. Defaults to true when load is provided. */
  readonly immediate?: boolean;
}

export interface ListModel<TItem, TNew = TItem> {
  readonly items: WritableSignal<TItem[]>;
  readonly status: WritableSignal<ListStatus>;
  readonly error: WritableSignal<unknown>;
  readonly loading: Readable<boolean>;
  readonly refreshing: Readable<boolean>;
  reload(): Promise<TItem[]>;
  reset(): Promise<TItem[]>;
  set(items: readonly TItem[]): void;
  add(value: TNew): Promise<TItem[]>;
  update(value: TItem): Promise<TItem[]>;
  remove(value: TItem): Promise<TItem[]>;
}

const storeActionListeners = new Set<StoreActionListener>();

export interface StoreDefinition<TStore> {
  /** Human-readable store name used by context and devtools. */
  readonly name: string;
  /** Context token used to provide and consume this store. */
  readonly token: ContextToken<TStore>;
  /** Creates a new isolated store instance. */
  create(): TStore;
  /** Provides a store instance to the current Wibble context frame. */
  provide(store?: TStore): TStore;
  /** Reads the nearest provided store instance from context. */
  use(): TStore;
}

/** Defines an official Wibble store with context-backed provide/use helpers. */
export function defineStore<TStore>(name: string, create: () => TStore): StoreDefinition<TStore> {
  const token = createContext<TStore>(`store:${name}`);

  return {
    name,
    token,
    create,
    provide(store = create()) {
      provide(token, store);
      return store;
    },
    use() {
      return useContext(token);
    }
  };
}

/** Subscribes to store action timeline events. */
export function subscribeStoreActions(listener: StoreActionListener): () => void {
  storeActionListeners.add(listener);
  return () => storeActionListeners.delete(listener);
}

/** Emits a store action event for devtools and test instrumentation. */
export function emitStoreAction(event: Omit<StoreActionEvent, "timestamp">): void {
  const next = { ...event, timestamp: Date.now() };
  for (const listener of storeActionListeners) {
    listener(next);
  }
}

/** Wraps an action body with Wibble store action timeline events. */
export async function runStoreAction<T>(
  store: string,
  action: string,
  work: () => T | Promise<T>,
  detail?: unknown
): Promise<T> {
  emitStoreAction({ store, action, phase: "start", detail });
  try {
    const result = await work();
    emitStoreAction({ store, action, phase: "success", detail });
    return result;
  } catch (error) {
    emitStoreAction({ store, action, phase: "error", detail: error });
    throw error;
  }
}

/** Converts a plain object into a field-by-field signal object. */
export function stateObject<T extends object>(initial: T): StoreState<T> {
  const entries = Object.entries(initial).map(([key, value]) => [key, signal(value)] as const);
  return Object.fromEntries(entries) as StoreState<T>;
}

/** Reads a signal state object into a plain immutable snapshot. */
export function snapshot<T extends object>(state: StoreState<T>): T {
  const entries = Object.entries(state).map(([key, value]) => [
    key,
    (value as Readable<unknown>).get()
  ]);

  return Object.fromEntries(entries) as T;
}

function storageFor(kind: StoreStorageKind | Storage | undefined): Storage | undefined {
  if (typeof kind === "object") {
    return kind;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  if (kind === "session") {
    return window.sessionStorage;
  }

  return window.localStorage;
}

/** Creates a signal synchronized with localStorage or sessionStorage. */
export function persistentSignal<T>(
  key: string,
  initial: T,
  options: PersistentSignalOptions<T> = {}
): WritableSignal<T> {
  const storage = storageFor(options.storage);
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize = options.deserialize ?? ((value: string) => JSON.parse(value) as T);
  let value = initial;

  const stored = storage?.getItem(key);
  if (stored != null) {
    try {
      value = deserialize(stored);
    } catch {
      value = initial;
    }
  }

  const state = signal(value);
  effect(() => {
    const next = state.get();
    storage?.setItem(key, serialize(next));
  });

  return state;
}

/** Creates a cache of Wibble store instances keyed by route/domain identity. */
export function createKeyedStore<TKey, TStore>(
  create: (key: TKey) => TStore,
  keyToString: (key: TKey) => string = (key) => JSON.stringify(key)
): KeyedStore<TKey, TStore> {
  const instances = new Map<string, { key: TKey; store: TStore }>();

  return {
    get(key) {
      const cacheKey = keyToString(key);
      const existing = instances.get(cacheKey);
      if (existing) {
        return existing.store;
      }

      const store = create(key);
      instances.set(cacheKey, { key, store });
      return store;
    },
    delete(key) {
      instances.delete(keyToString(key));
    },
    clear() {
      instances.clear();
    },
    keys() {
      return [...instances.values()].map((entry) => entry.key);
    }
  };
}

/** Creates a resource from a store module while keeping the official Wibble resource semantics. */
export function createStoreResource<T>(options: ResourceOptions<T>): Resource<T> {
  return createResource(options);
}

/** Creates an idiomatic Wibble list model with load/add/update/remove/reset workflows. */
export function createListModel<TItem, TNew = TItem>(
  options: ListModelOptions<TItem, TNew> = {}
): ListModel<TItem, TNew> {
  const items = signal<TItem[]>([...(options.initialItems ?? [])]);
  const status = signal<ListStatus>(options.load && options.immediate !== false ? "loading" : "idle");
  const error = signal<unknown>(undefined);
  const loading = signal(status.peek() === "loading");
  const refreshing = signal(false);

  effect(() => {
    const nextStatus = status.get();
    loading.set(nextStatus === "loading");
    refreshing.set(nextStatus === "refreshing");
  });

  async function reload(): Promise<TItem[]> {
    if (!options.load) {
      status.set("ready");
      return items.peek();
    }

    error.set(undefined);
    status.set(items.peek().length === 0 ? "loading" : "refreshing");
    try {
      const next = [...await options.load()];
      items.set(next);
      status.set("ready");
      return next;
    } catch (reason) {
      error.set(reason);
      status.set("error");
      return items.peek();
    }
  }

  async function mutate(
    operation: "add" | "update" | "remove",
    value: TItem | TNew,
    handler: ((current: readonly TItem[], value: never) => Promise<readonly TItem[]> | readonly TItem[]) | undefined
  ): Promise<TItem[]> {
    if (!handler) {
      throw new Error(`Missing list ${operation} operation.`);
    }

    error.set(undefined);
    status.set("mutating");
    try {
      const next = [...await handler(items.peek(), value as never)];
      items.set(next);
      status.set("ready");
      return next;
    } catch (reason) {
      error.set(reason);
      status.set("error");
      return items.peek();
    }
  }

  const model: ListModel<TItem, TNew> = {
    items,
    status,
    error,
    loading,
    refreshing,
    reload,
    reset() {
      items.set([...(options.initialItems ?? [])]);
      return reload();
    },
    set(next) {
      items.set([...next]);
      status.set("ready");
    },
    add(value) {
      return mutate("add", value, options.add as never);
    },
    update(value) {
      return mutate("update", value, options.update as never);
    },
    remove(value) {
      return mutate("remove", value, options.remove as never);
    }
  };

  if (options.load && options.immediate !== false) {
    void reload();
  }

  return model;
}
