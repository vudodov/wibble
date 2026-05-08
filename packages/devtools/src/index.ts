import { subscribeHttpEvents } from "@wibble/http";
import type { Router } from "@wibble/router";
import { subscribeStoreActions } from "@wibble/store";

export type DevtoolsEventType = "signal" | "resource" | "store" | "route" | "render";

export interface DevtoolsEvent {
  readonly type: DevtoolsEventType;
  readonly name: string;
  readonly detail?: unknown;
  readonly timestamp: number;
}

export type DevtoolsListener = (event: DevtoolsEvent) => void;

export type DevtoolsDispose = () => void;

const listeners = new Set<DevtoolsListener>();

/** Emits a Wibble devtools event to registered listeners. */
export function emitDevtoolsEvent(type: DevtoolsEventType, name: string, detail?: unknown): void {
  const event: DevtoolsEvent = { type, name, detail, timestamp: Date.now() };
  for (const listener of listeners) {
    listener(event);
  }
}

/** Subscribes to Wibble devtools events. */
export function subscribeDevtools(listener: DevtoolsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Captures devtools events in memory for tests and simple inspectors. */
export function createDevtoolsTimeline(): { readonly events: DevtoolsEvent[]; dispose(): void } {
  const events: DevtoolsEvent[] = [];
  const dispose = subscribeDevtools((event) => events.push(event));
  return { events, dispose };
}

/** Bridges @wibble/store action events into the unified devtools stream. */
export function installStoreDevtools(): DevtoolsDispose {
  return subscribeStoreActions((event) => {
    emitDevtoolsEvent("store", `${event.store}.${event.action}`, event);
  });
}

/** Bridges @wibble/http request lifecycle events into the unified devtools stream. */
export function installHttpDevtools(): DevtoolsDispose {
  return subscribeHttpEvents((event) => {
    emitDevtoolsEvent("resource", `${event.method} ${event.url}`, event);
  });
}

/** Bridges router transitions and route errors into the unified devtools stream. */
export function installRouterDevtools(router: Router, name = "router"): DevtoolsDispose {
  const emitRoute = () => {
    const match = router.current.peek();
    emitDevtoolsEvent("route", name, {
      path: match.context.path,
      params: match.context.params,
      query: [...match.context.query.entries()],
      chain: match.chain.map((route) => route.path)
    });
  };
  const emitError = () => {
    const error = router.error.peek();
    if (error) {
      emitDevtoolsEvent("route", `${name}.error`, error);
    }
  };

  emitRoute();
  const stopRoute = router.current.subscribe(emitRoute);
  const stopError = router.error.subscribe(emitError);

  return () => {
    stopRoute();
    stopError();
  };
}

/** Installs the standard Wibble devtools bridges and returns a single disposer. */
export function installWibbleDevtools(options: { readonly router?: Router } = {}): DevtoolsDispose {
  const disposers = [
    installStoreDevtools(),
    installHttpDevtools(),
    options.router ? installRouterDevtools(options.router) : undefined
  ].filter((dispose): dispose is DevtoolsDispose => Boolean(dispose));

  return () => {
    for (const dispose of [...disposers].reverse()) {
      dispose();
    }
  };
}
