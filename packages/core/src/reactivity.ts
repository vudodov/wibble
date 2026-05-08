export type Dispose = () => void;

export interface Readable<T> {
  get(): T;
  peek(): T;
  subscribe(listener: () => void): Dispose;
}

export interface WritableSignal<T> extends Readable<T> {
  set(next: T): void;
  update(updater: (current: T) => T): void;
}

type Dependency = Set<Observer>;

interface Observer {
  run(): void;
  deps: Set<Dependency>;
  cleanups: Dispose[];
  queued: boolean;
  disposed: boolean;
}

let activeObserver: Observer | null = null;
let currentScope: ScopeImpl | null = null;
let batchDepth = 0;
let flushQueued = false;
const pendingObservers = new Set<Observer>();

function cleanupObserver(observer: Observer): void {
  for (const dep of observer.deps) {
    dep.delete(observer);
  }
  observer.deps.clear();

  const cleanups = observer.cleanups.splice(0);
  for (const cleanup of cleanups) {
    cleanup();
  }
}

function queueObserver(observer: Observer): void {
  if (observer.disposed || observer.queued) {
    return;
  }

  observer.queued = true;
  pendingObservers.add(observer);

  if (batchDepth === 0 && !flushQueued) {
    flushQueued = true;
    queueMicrotask(flush);
  }
}

function flush(): void {
  flushQueued = false;

  while (pendingObservers.size > 0) {
    const observers = [...pendingObservers];
    pendingObservers.clear();

    for (const observer of observers) {
      observer.queued = false;
      if (!observer.disposed) {
        observer.run();
      }
    }
  }
}

function track(dependency: Dependency): void {
  if (!activeObserver) {
    return;
  }

  dependency.add(activeObserver);
  activeObserver.deps.add(dependency);
}

export function batch<T>(work: () => T): T {
  batchDepth += 1;
  try {
    return work();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && pendingObservers.size > 0 && !flushQueued) {
      flushQueued = true;
      queueMicrotask(flush);
    }
  }
}

export function untracked<T>(work: () => T): T {
  const previous = activeObserver;
  activeObserver = null;
  try {
    return work();
  } finally {
    activeObserver = previous;
  }
}

export function signal<T>(initial: T): WritableSignal<T> {
  let value = initial;
  const dependency: Dependency = new Set();

  return {
    get(): T {
      track(dependency);
      return value;
    },
    peek(): T {
      return value;
    },
    set(next: T): void {
      if (Object.is(value, next)) {
        return;
      }

      value = next;
      for (const observer of [...dependency]) {
        queueObserver(observer);
      }
    },
    update(updater: (current: T) => T): void {
      this.set(updater(value));
    },
    subscribe(listener: () => void): Dispose {
      const observer: Observer = {
        deps: new Set(),
        cleanups: [],
        queued: false,
        disposed: false,
        run: listener
      };

      dependency.add(observer);
      return () => {
        observer.disposed = true;
        dependency.delete(observer);
      };
    }
  };
}

export function computed<T>(compute: () => T): Readable<T> {
  const value = signal<T>(undefined as T);
  effect(() => {
    value.set(compute());
  });

  const readable: Readable<T> = {
    get: value.get,
    peek: value.peek,
    subscribe: value.subscribe
  };

  return readable;
}

export function effect(work: (onCleanup: (cleanup: Dispose) => void) => void): Dispose {
  const owner = currentScope;
  const observer: Observer = {
    deps: new Set(),
    cleanups: [],
    queued: false,
    disposed: false,
    run() {
      cleanupObserver(observer);
      const previousObserver = activeObserver;
      const previousScope = currentScope;
      activeObserver = observer;
      currentScope = owner;
      try {
        work((cleanup) => {
          observer.cleanups.push(cleanup);
        });
      } finally {
        activeObserver = previousObserver;
        currentScope = previousScope;
      }
    }
  };

  observer.run();

  const dispose = () => {
    if (observer.disposed) {
      return;
    }

    observer.disposed = true;
    pendingObservers.delete(observer);
    cleanupObserver(observer);
  };

  owner?.add(dispose);
  return dispose;
}

export interface Scope {
  readonly disposed: boolean;
  run<T>(work: () => T): T;
  add(dispose: Dispose): void;
  dispose(): void;
}

class ScopeImpl implements Scope {
  #disposables = new Set<Dispose>();
  #disposed = false;

  get disposed(): boolean {
    return this.#disposed;
  }

  run<T>(work: () => T): T {
    if (this.#disposed) {
      throw new Error("Cannot run work in a disposed Wibble scope.");
    }

    const previous = currentScope;
    currentScope = this;
    try {
      return work();
    } finally {
      currentScope = previous;
    }
  }

  add(dispose: Dispose): void {
    if (this.#disposed) {
      dispose();
      return;
    }

    this.#disposables.add(dispose);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    const disposables = [...this.#disposables].reverse();
    this.#disposables.clear();

    for (const dispose of disposables) {
      dispose();
    }
  }
}

export function createScope(): Scope {
  return new ScopeImpl();
}

export function getCurrentScope(): Scope | null {
  return currentScope;
}

export function onScopeDispose(dispose: Dispose): void {
  if (!currentScope) {
    throw new Error("onScopeDispose() must be called inside a Wibble scope.");
  }

  currentScope.add(dispose);
}

export function watch<T>(
  read: () => T,
  onChange: (next: T, previous: T | undefined) => void,
  options: { immediate?: boolean } = {}
): Dispose {
  let initialized = false;
  let previous: T | undefined;

  return effect(() => {
    const next = read();
    if (!initialized) {
      initialized = true;
      if (options.immediate) {
        onChange(next, previous);
      }
      previous = next;
      return;
    }

    if (!Object.is(previous, next)) {
      const old = previous;
      previous = next;
      onChange(next, old);
    }
  });
}
