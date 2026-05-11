import { createScope, effect, getCurrentScope, onScopeDispose, type Dispose, type Readable, type Scope } from "./reactivity";
import { captureContextFrame, withContextFrame, type ContextSnapshot } from "./context";

/** A Wibble component accepts typed props and returns one or more DOM nodes. */
export type Component<P = Record<string, never>> = (props: P) => Node | Node[];

/** Named component slots. Each slot lazily renders one or more DOM nodes. */
export type WibbleSlots = Record<string, () => Node | Node[]>;

export interface MountHandle {
  scope: Scope;
  dispose(): void;
}

export interface Ref<T extends Element = Element> {
  readonly current: T | undefined;
}

export interface AsyncBoundaryOptions<T> {
  /** Reactive async task to run. Returning a Promise switches the boundary into pending state. */
  readonly load: () => T | Promise<T>;
  /** Renders resolved data. */
  readonly ready: (value: T) => Node | Node[];
  /** Renders while the task is pending. */
  readonly loading?: () => Node | Node[];
  /** Renders rejected errors. */
  readonly error?: (error: unknown) => Node | Node[];
}

export interface PortalHandle {
  readonly target: Element;
  dispose(): void;
}

/** A literal value, signal-like readable, or function that can be read reactively. */
export type MaybeReadable<T> = T | Readable<T> | (() => T);

function renderInScope(scope: Scope, render: () => Node | Node[], parentFrame: ContextSnapshot | undefined): Node[] {
  return scope.run(() => withContextFrame(() => normalizeNodes(render()), parentFrame));
}

/** Reads literals, functions, and Wibble readables through one common API. */
export function read<T>(value: MaybeReadable<T>): T {
  if (typeof value === "function") {
    return (value as () => T)();
  }

  if (value && typeof value === "object" && "get" in value && typeof value.get === "function") {
    return value.get();
  }

  return value as T;
}

/** Mounts a Wibble component into a DOM target and owns its cleanup scope. */
export function mount<P>(component: Component<P>, target: Element, props: P): MountHandle {
  const scope = createScope();
  const nodes = renderInScope(scope, () => component(props), undefined);
  target.replaceChildren(...nodes);

  return {
    scope,
    dispose() {
      scope.dispose();
      target.replaceChildren();
    }
  };
}

/** Normalizes a node or node list into an array. */
export function normalizeNodes(nodes: Node | Node[]): Node[] {
  return Array.isArray(nodes) ? nodes : [nodes];
}

/** Creates a tiny mutable ref object for explicit DOM escape hatches. */
export function createRef<T extends Element = Element>(): Ref<T> {
  return { current: undefined };
}

/** Assigns an element to a ref and clears it when the current Wibble scope is disposed. */
export function bindRef<T extends Element>(ref: Ref<T>, element: T): T {
  (ref as { current: T | undefined }).current = element;
  getCurrentScope()?.add(() => {
    if (ref.current === element) {
      (ref as { current: T | undefined }).current = undefined;
    }
  });
  return element;
}

/** Creates a text node whose content stays synchronized with a reactive value. */
export function createText(value: MaybeReadable<unknown>): Text {
  const node = document.createTextNode("");
  bindText(node, value);
  return node;
}

/** Binds text content to a reactive value. */
export function bindText(node: CharacterData, value: MaybeReadable<unknown>): Dispose {
  return effect(() => {
    const next = read(value);
    node.textContent = next == null ? "" : String(next);
  });
}

/** Binds an element attribute to a reactive value. Falsey nullish values remove it. */
export function bindAttr(element: Element, name: string, value: MaybeReadable<unknown>): Dispose {
  return effect(() => {
    const next = read(value);
    if (next === false || next == null) {
      element.removeAttribute(name);
      return;
    }

    if (next === true) {
      element.setAttribute(name, "");
      return;
    }

    element.setAttribute(name, String(next));
  });
}

/** Toggles a class name based on a reactive boolean value. */
export function bindClass(element: Element, name: string, active: MaybeReadable<boolean>): Dispose {
  return effect(() => {
    element.classList.toggle(name, Boolean(read(active)));
  });
}

/** Adds an event listener and automatically removes it with the current scope. */
export function listen(
  element: Element,
  eventName: string,
  handler: (event: Event) => void
): Dispose {
  const listener = handler as EventListener;
  element.addEventListener(eventName, listener);
  const dispose = () => element.removeEventListener(eventName, listener);
  onScopeDispose(dispose);
  return dispose;
}

/** Creates an HTML element with optional configuration and static children. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  configure?: (element: HTMLElementTagNameMap[K]) => void,
  children: Array<Node | string> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  configure?.(node);

  for (const child of children) {
    node.append(child);
  }

  return node;
}

/** Runs work in the next microtask after the current component has mounted. */
export function onMount(work: () => void | Dispose): void {
  const scope = getCurrentScope();
  queueMicrotask(() => {
    if (scope?.disposed) {
      return;
    }

    const cleanup = work();
    if (cleanup) {
      scope?.add(cleanup);
    }
  });
}

/** Focuses an element after mount when the optional condition is true. */
export function autoFocus(element: HTMLElement, when: MaybeReadable<boolean> = true): Dispose {
  return effect(() => {
    if (read(when)) {
      queueMicrotask(() => {
        if (element.isConnected) {
          element.focus();
        }
      });
    }
  });
}

/** Renders a child component with optional named slots. */
export function renderComponent<P extends { slots?: WibbleSlots }>(
  component: Component<P>,
  props: Omit<P, "slots"> & { slots?: WibbleSlots }
): Node[] {
  const parentFrame = captureContextFrame();
  const scope = createScope();
  getCurrentScope()?.add(() => scope.dispose());
  return renderInScope(scope, () => component(props as P), parentFrame);
}

/** Renders a named slot or fallback content. */
export function renderSlot(slots: WibbleSlots | undefined, name: string, fallback: () => Node | Node[]): Node[] {
  const slot = slots?.[name];
  return normalizeNodes(slot ? slot() : fallback());
}

/** Renders nodes into a target outside the current component tree and cleans them up with scope disposal. */
export function renderPortal(target: Element, render: () => Node | Node[]): PortalHandle {
  const parentFrame = captureContextFrame();
  const scope = createScope();
  const nodes = renderInScope(scope, render, parentFrame);
  target.append(...nodes);

  const handle: PortalHandle = {
    target,
    dispose() {
      scope.dispose();
      for (const node of nodes) {
        node.parentNode?.removeChild(node);
      }
    }
  };
  getCurrentScope()?.add(handle.dispose);
  return handle;
}

/** Reactively swaps a branch while disposing effects owned by the old branch. */
export function conditional(parent: ParentNode, render: () => Node | Node[]): Dispose {
  const marker = document.createComment("wibble:if");
  parent.append(marker);
  let scope: Scope | undefined;
  let nodes: Node[] = [];

  const stop = effect((onCleanup) => {
    scope?.dispose();
    for (const node of nodes) {
      node.parentNode?.removeChild(node);
    }

    const parentFrame = captureContextFrame();
    scope = createScope();
    nodes = renderInScope(scope, render, parentFrame);
    for (const node of nodes) {
      parent.insertBefore(node, marker);
    }

    onCleanup(() => {
      scope?.dispose();
      scope = undefined;
      for (const node of nodes) {
        node.parentNode?.removeChild(node);
      }
      nodes = [];
    });
  });

  const dispose = () => {
    stop();
    marker.parentNode?.removeChild(marker);
  };
  getCurrentScope()?.add(dispose);
  return dispose;
}

export interface KeyedItem<T> {
  scope: Scope;
  nodes: Node[];
  value: T;
}

export function keyedEach<T, K>(
  parent: ParentNode,
  readItems: () => readonly T[],
  keyOf: (item: T) => K,
  render: (item: T) => Node | Node[]
): Dispose {
  const start = document.createComment("wibble:each-start");
  const marker = document.createComment("wibble:each-end");
  parent.append(start);
  parent.append(marker);
  const records = new Map<K, KeyedItem<T>>();

  function createRecord(item: T): KeyedItem<T> {
    const parentFrame = captureContextFrame();
    const scope = createScope();
    const nodes = renderInScope(scope, () => render(item), parentFrame);
    return { scope, nodes, value: item };
  }

  function disposeRecords(): void {
    for (const record of records.values()) {
      record.scope.dispose();
      for (const node of record.nodes) {
        node.parentNode?.removeChild(node);
      }
    }
    records.clear();
  }

  const stop = effect(() => {
    const nextItems = readItems();
    const nextRecords = new Map<K, KeyedItem<T>>();
    const nextNodes: Node[] = [];

    for (const item of nextItems) {
      const key = keyOf(item);
      if (nextRecords.has(key)) {
        throw new Error(`Duplicate key \`${String(key)}\` in Wibble keyed list.`);
      }

      const existing = records.get(key);

      if (existing) {
        if (Object.is(existing.value, item)) {
          nextRecords.set(key, existing);
          nextNodes.push(...existing.nodes);
        } else {
          existing.scope.dispose();
          for (const node of existing.nodes) {
            node.parentNode?.removeChild(node);
          }
          const nextRecord = createRecord(item);
          nextRecords.set(key, nextRecord);
          nextNodes.push(...nextRecord.nodes);
        }
        continue;
      }

      const record = createRecord(item);
      nextRecords.set(key, record);
      nextNodes.push(...record.nodes);
    }

    for (const [key, record] of records) {
      if (!nextRecords.has(key)) {
        record.scope.dispose();
        for (const node of record.nodes) {
          node.parentNode?.removeChild(node);
        }
      }
    }

    for (const node of nextNodes) {
      parent.insertBefore(node, marker);
    }

    records.clear();
    for (const [key, record] of nextRecords) {
      records.set(key, record);
    }
  });

  const dispose = () => {
    stop();
    disposeRecords();
    start.parentNode?.removeChild(start);
    marker.parentNode?.removeChild(marker);
  };
  getCurrentScope()?.add(dispose);
  return dispose;
}

export function errorBoundary(render: () => Node | Node[], fallback: (error: unknown) => Node | Node[]): Node[] {
  try {
    return normalizeNodes(render());
  } catch (error) {
    return normalizeNodes(fallback(error));
  }
}

/** Renders loading, ready, and error branches for a reactive async task. */
export function asyncBoundary<T>(parent: ParentNode, options: AsyncBoundaryOptions<T>): Dispose {
  const marker = document.createComment("wibble:async");
  parent.append(marker);
  let scope: Scope | undefined;
  let nodes: Node[] = [];
  let version = 0;

  function replace(render: () => Node | Node[]): void {
    scope?.dispose();
    for (const node of nodes) {
      node.parentNode?.removeChild(node);
    }

    const parentFrame = captureContextFrame();
    scope = createScope();
    nodes = renderInScope(scope, render, parentFrame);
    for (const node of nodes) {
      parent.insertBefore(node, marker);
    }
  }

  const stop = effect((onCleanup) => {
    const currentVersion = ++version;
    const value = options.load();

    if (value instanceof Promise) {
      replace(options.loading ?? (() => []));
      void value.then((result) => {
        if (currentVersion === version) {
          replace(() => options.ready(result));
        }
      }).catch((reason) => {
        if (currentVersion === version) {
          replace(options.error ? () => options.error!(reason) : () => document.createTextNode(reason instanceof Error ? reason.message : String(reason)));
        }
      });
    } else {
      replace(() => options.ready(value));
    }

    onCleanup(() => {
      scope?.dispose();
      scope = undefined;
      for (const node of nodes) {
        node.parentNode?.removeChild(node);
      }
      nodes = [];
    });
  });

  const dispose = () => {
    stop();
    marker.parentNode?.removeChild(marker);
  };
  getCurrentScope()?.add(dispose);
  return dispose;
}

/** Observes element resize events and cleans up with the current scope. */
export function observeResize(element: Element, callback: ResizeObserverCallback): Dispose {
  if (typeof ResizeObserver === "undefined") {
    return () => {};
  }

  const observer = new ResizeObserver(callback);
  observer.observe(element);
  const dispose = () => observer.disconnect();
  getCurrentScope()?.add(dispose);
  return dispose;
}

/** Observes element intersection events and cleans up with the current scope. */
export function observeIntersection(
  element: Element,
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): Dispose {
  if (typeof IntersectionObserver === "undefined") {
    return () => {};
  }

  const observer = new IntersectionObserver(callback, options);
  observer.observe(element);
  const dispose = () => observer.disconnect();
  getCurrentScope()?.add(dispose);
  return dispose;
}

/** Observes DOM mutations for integration points that cannot be modeled declaratively. */
export function observeMutation(
  target: Node,
  callback: MutationCallback,
  options: MutationObserverInit = { childList: true, subtree: true }
): Dispose {
  if (typeof MutationObserver === "undefined") {
    return () => {};
  }

  const observer = new MutationObserver(callback);
  observer.observe(target, options);
  const dispose = () => observer.disconnect();
  getCurrentScope()?.add(dispose);
  return dispose;
}
