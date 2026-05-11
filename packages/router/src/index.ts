import {
  createResource,
  createScope,
  effect,
  read,
  renderComponent,
  signal,
  type Component,
  type MaybeReadable,
  type Readable,
  type Resource,
  type Scope,
  type WibbleSlots,
  type WritableSignal
} from "@wibble/core";

export interface RouteContext<TParams extends Record<string, string> = Record<string, string>> {
  readonly path: string;
  readonly params: TParams;
  readonly query: URLSearchParams;
}

export type RouteLoader<TParams extends Record<string, string> = Record<string, string>> = (
  context: RouteContext<TParams>
) => Promise<unknown>;

export type RouteRedirect<TParams extends Record<string, string> = Record<string, string>> =
  | string
  | ((context: RouteContext<TParams>) => string | undefined);

export type LazyRouteComponent<TParams extends Record<string, string> = Record<string, string>> = () => Promise<
  Component<RouteContext<TParams>> | { default: Component<RouteContext<TParams>> }
>;

export type RouteEnter<TParams extends Record<string, string> = Record<string, string>> = (
  context: RouteContext<TParams>
) => void | (() => void) | Promise<void | (() => void)>;

export type RouteLeave<TParams extends Record<string, string> = Record<string, string>> = (
  context: RouteContext<TParams>
) => void | Promise<void>;

export interface Route<TParams extends Record<string, string> = Record<string, string>> {
  /** Path pattern. Use `:id` params, `*` catch-alls, or relative child paths. */
  readonly path: string;
  /** Component rendered for this route or layout. */
  readonly component?: Component<RouteContext<TParams> & { slots?: WibbleSlots }>;
  /** Lazily imported route component. */
  readonly lazy?: LazyRouteComponent<TParams>;
  /** Component rendered when a route-level lazy or lifecycle error reaches this route. */
  readonly errorComponent?: Component<RouteContext<TParams> & { error: unknown; slots?: WibbleSlots }>;
  /** Primary route resource. */
  readonly load?: RouteLoader<TParams>;
  /** Named route resources for page-level data. */
  readonly resources?: Record<string, RouteLoader<TParams>>;
  /** Nested route records. Parent components act as layouts through the default slot. */
  readonly children?: readonly Route[];
  /** Redirect target for this route. */
  readonly redirect?: RouteRedirect<TParams>;
  /** Runs when the route becomes active. Return a cleanup to dispose route-scoped work. */
  readonly enter?: RouteEnter<TParams>;
  /** Runs when the route stops being active. */
  readonly leave?: RouteLeave<TParams>;
}

export interface RouteMatch {
  readonly route: Route;
  readonly chain: readonly Route[];
  readonly context: RouteContext;
  readonly resource?: Resource<unknown>;
  readonly resources: Record<string, Resource<unknown>>;
}

export interface RouterOptions {
  /** Base path for apps served below the origin root, for example `/console`. */
  readonly basename?: string;
  readonly notFound?: Route;
  /** Receives uncaught route lifecycle and lazy component errors. */
  readonly onError?: (error: unknown, match: RouteMatch) => void;
}

export interface Router {
  readonly current: Readable<RouteMatch>;
  readonly error: Readable<unknown>;
  navigate(path: string): void;
  prefetch(path: string): Promise<void>;
  link(path: string): { href: string; onclick(event: MouseEvent): void };
  start(): () => void;
}

export interface RouterOutletProps {
  readonly router: MaybeReadable<Router>;
}

interface RouteRecord {
  readonly route: Route;
  readonly chain: readonly Route[];
  readonly fullPath: string;
}

const defaultNotFoundRoute: Route = {
  path: "*",
  component: () => document.createTextNode("Not found")
};

const lazyComponents = new WeakMap<Route, Component<any>>();
const lazyInflight = new WeakMap<Route, Promise<Component<any>>>();

function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }

  return path;
}

function normalizeBasename(path: string | undefined): string {
  if (!path || path === "/") {
    return "";
  }

  return normalizePath(path).replace(/\/+$/, "");
}

function stripBasename(path: string, basename: string): string {
  if (!basename) {
    return normalizePath(path);
  }

  if (path === basename) {
    return "/";
  }

  if (path.startsWith(`${basename}/`)) {
    return normalizePath(path.slice(basename.length));
  }

  return normalizePath(path);
}

function addBasename(path: string, basename: string): string {
  const normalized = normalizePath(path);
  if (!basename) {
    return normalized;
  }

  return normalized === "/" ? basename || "/" : `${basename}${normalized}`;
}

function joinPath(parent: string, child: string): string {
  if (child === "*") {
    return "*";
  }

  if (child.startsWith("/")) {
    return normalizePath(child);
  }

  const prefix = parent === "/" ? "" : parent.replace(/\/+$/, "");
  return normalizePath(`${prefix}/${child}`);
}

function splitPath(path: string): string[] {
  return normalizePath(path).replace(/\/+$/, "").split("/").filter(Boolean);
}

function collectRoutes(routes: readonly Route[], parentPath = "", parents: readonly Route[] = []): RouteRecord[] {
  const records: RouteRecord[] = [];

  for (const route of routes) {
    const fullPath = route.path === "*" ? "*" : joinPath(parentPath || "/", route.path);
    const chain = [...parents, route];

    if (route.children) {
      records.push(...collectRoutes(route.children, fullPath, chain));
    }

    records.push({ route, chain, fullPath });
  }

  return records;
}

function matchPath(pattern: string, path: string): RouteContext | undefined {
  if (pattern === "*") {
    return {
      path,
      params: {},
      query: new URL(path, window.location.origin).searchParams
    };
  }

  const url = new URL(path, window.location.origin);
  const actual = splitPath(url.pathname);
  const expected = splitPath(pattern);

  if (actual.length !== expected.length) {
    return undefined;
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const expectedPart = expected[index];
    const actualPart = actual[index];

    if (!expectedPart || !actualPart) {
      return undefined;
    }

    if (expectedPart.startsWith(":")) {
      params[expectedPart.slice(1)] = decodeURIComponent(actualPart);
      continue;
    }

    if (expectedPart !== actualPart) {
      return undefined;
    }
  }

  return {
    path: url.pathname,
    params,
    query: url.searchParams
  };
}

function routeResources(route: Route, context: RouteContext): Record<string, Resource<unknown>> {
  const resources: Record<string, Resource<unknown>> = {};

  for (const [name, load] of Object.entries(route.resources ?? {})) {
    resources[name] = createResource({
      key: () => ["route-resource", route.path, name, context.path, [...context.query.entries()]],
      load: () => load(context)
    });
  }

  return resources;
}

function makeMatch(record: RouteRecord, context: RouteContext): RouteMatch {
  const resource = record.route.load
    ? createResource({
        key: () => ["route", record.fullPath, context.path, [...context.query.entries()]],
        load: () => record.route.load?.(context) ?? Promise.resolve(undefined)
      })
    : undefined;

  return {
    route: record.route,
    chain: record.chain,
    context,
    resource,
    resources: routeResources(record.route, context)
  };
}

function redirectTarget(route: Route, context: RouteContext): string | undefined {
  if (!route.redirect) {
    return undefined;
  }

  return typeof route.redirect === "function" ? route.redirect(context) : route.redirect;
}

function findRecord(records: readonly RouteRecord[], path: string): { record: RouteRecord; context: RouteContext } | undefined {
  for (const record of records) {
    const context = matchPath(record.fullPath, path);
    if (context) {
      return { record, context };
    }
  }

  return undefined;
}

function resolveMatch(records: readonly RouteRecord[], notFound: Route, path: string, depth = 0): RouteMatch {
  const found = findRecord(records, path);
  if (found) {
    const target = redirectTarget(found.record.route, found.context);
    if (target && depth < 8) {
      return resolveMatch(records, notFound, target, depth + 1);
    }

    return makeMatch(found.record, found.context);
  }

  const context = {
    path,
    params: {},
    query: new URL(path, window.location.origin).searchParams
  };
  return makeMatch({ route: notFound, chain: [notFound], fullPath: "*" }, context);
}

async function ensureLazy(route: Route): Promise<Component<any> | undefined> {
  if (!route.lazy) {
    return route.component;
  }

  const cached = lazyComponents.get(route);
  if (cached) {
    return cached;
  }

  let inflight = lazyInflight.get(route);
  if (!inflight) {
    inflight = route.lazy().then((mod) => {
      const component = typeof mod === "function" ? mod : mod.default;
      lazyComponents.set(route, component);
      lazyInflight.delete(route);
      return component;
    });
    lazyInflight.set(route, inflight);
  }

  return inflight;
}

function componentFor(route: Route): Component<RouteContext & { slots?: WibbleSlots }> {
  return (lazyComponents.get(route) ?? route.component ?? (() => document.createTextNode("Loading route"))) as Component<RouteContext & { slots?: WibbleSlots }>;
}

function renderRouteChain(match: RouteMatch): Node[] {
  let rendered = renderComponent(componentFor(match.route), match.context);

  for (let index = match.chain.length - 2; index >= 0; index -= 1) {
    const route = match.chain[index];
    if (!route) {
      continue;
    }

    const childNodes = rendered;
    rendered = renderComponent(componentFor(route), {
      ...match.context,
      slots: {
        default: () => childNodes
      }
    });
  }

  return rendered;
}

function renderRouteError(match: RouteMatch, error: unknown): Node[] {
  const errorIndex = [...match.chain].reverse().findIndex((route) => route.errorComponent);
  if (errorIndex < 0) {
    return [document.createTextNode(error instanceof Error ? error.message : String(error))];
  }

  const index = match.chain.length - 1 - errorIndex;
  const route = match.chain[index];
  let rendered = route?.errorComponent
    ? renderComponent(route.errorComponent, { ...match.context, error })
    : [];

  for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
    const parent = match.chain[parentIndex];
    if (!parent) {
      continue;
    }

    const childNodes = rendered;
    rendered = renderComponent(componentFor(parent), {
      ...match.context,
      slots: {
        default: () => childNodes
      }
    });
  }

  return rendered;
}

/** Creates a browser history router with typed params, query parsing, nested routes, redirects, lazy routes, and route resources. */
export function createRouter(routes: readonly Route[], options: RouterOptions = {}): Router {
  const records = collectRoutes(routes);
  const notFound = options.notFound ?? defaultNotFoundRoute;
  const basename = normalizeBasename(options.basename);
  const initialPath = stripBasename(window.location.pathname, basename) + window.location.search;
  const current: WritableSignal<RouteMatch> = signal(resolveMatch(records, notFound, initialPath));
  const error: WritableSignal<unknown> = signal(undefined);
  let activeMatch = current.peek();
  let active = false;
  let activationVersion = 0;
  let activeDisposers: Array<() => void> = [];

  function reportError(reason: unknown, match = current.peek()): void {
    error.set(reason);
    options.onError?.(reason, match);
  }

  function deactivate(match: RouteMatch): void {
    for (const dispose of [...activeDisposers].reverse()) {
      dispose();
    }
    activeDisposers = [];

    for (const route of [...match.chain].reverse()) {
      void Promise.resolve(route.leave?.(match.context)).catch((reason) => reportError(reason, match));
    }
  }

  function activate(match: RouteMatch): void {
    const version = ++activationVersion;
    if (active) {
      deactivate(activeMatch);
    }
    active = true;
    activeMatch = match;
    error.set(undefined);
    current.set(match);

    for (const route of match.chain) {
      void Promise.resolve(route.enter?.(match.context))
        .then((dispose) => {
          if (version === activationVersion && typeof dispose === "function") {
            activeDisposers.push(dispose);
          }
        })
        .catch((reason) => reportError(reason, match));
    }
  }

  function setCurrent(path: string): void {
    const match = resolveMatch(records, notFound, path);
    activate(match);

    for (const route of match.chain) {
      void ensureLazy(route).then(() => {
        if (current.peek().context.path === match.context.path) {
          current.set(resolveMatch(records, notFound, stripBasename(window.location.pathname, basename) + window.location.search));
        }
      }).catch((reason) => reportError(reason, match));
    }
  }

  function navigate(path: string): void {
    const next = normalizePath(path);
    window.history.pushState(null, "", addBasename(next, basename));
    setCurrent(next);
  }

  async function prefetch(path: string): Promise<void> {
    const match = resolveMatch(records, notFound, normalizePath(path));
    await Promise.all([
      ...match.chain.map((route) => ensureLazy(route)),
      match.resource?.reload(),
      ...Object.values(match.resources).map((resource) => resource.reload())
    ]);
  }

  function start(): () => void {
    if (!active) {
      activate(current.peek());
    }

    const onPopState = () => {
      setCurrent(stripBasename(window.location.pathname, basename) + window.location.search);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }

  return {
    current,
    error,
    navigate,
    prefetch,
    link(path: string) {
      const href = addBasename(normalizePath(path), basename);
      return {
        href,
        onclick(event: MouseEvent) {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) {
            return;
          }

          event.preventDefault();
          navigate(path);
        }
      };
    },
    start
  };
}

/** Renders the current route and disposes the previous route scope on navigation. */
export const RouterOutlet: Component<RouterOutletProps> = (props) => {
  const container = document.createElement("div");
  container.setAttribute("data-wibble-router-outlet", "");

  effect((onCleanup) => {
    const router = read(props.router);
    const match = router.current.get();
    const error = router.error.get();
    let routeScope: Scope | undefined = createScope();
    const nodes = routeScope.run(() => error ? renderRouteError(match, error) : renderRouteChain(match));
    container.replaceChildren(...nodes);

    onCleanup(() => {
      routeScope?.dispose();
      routeScope = undefined;
    });
  });

  return container;
};
