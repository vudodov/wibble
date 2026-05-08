import { afterEach, describe, expect, it } from "vitest";
import { createRouter, type Route } from "../src";

const originalWindow = globalThis.window;

function installWindow(path = "/"): void {
  const listeners = new Map<string, EventListener>();
  globalThis.window = {
    location: {
      origin: "http://localhost",
      pathname: path,
      search: ""
    },
    history: {
      pushState(_state: unknown, _title: string, next: string) {
        const url = new URL(next, "http://localhost");
        globalThis.window.location.pathname = url.pathname;
        globalThis.window.location.search = url.search;
      }
    },
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    }
  } as unknown as Window & typeof globalThis;
}

describe("router", () => {
  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("matches nested params and follows redirects", () => {
    installWindow("/");
    const routes: Route[] = [{
      path: "/",
      component: () => [],
      children: [
        { path: "city/:city", component: () => [] },
        { path: "legacy", redirect: "/city/Melbourne" }
      ]
    }];
    const router = createRouter(routes);

    router.navigate("/legacy");

    expect(router.current.get().context.path).toBe("/city/Melbourne");
    expect(router.current.get().context.params.city).toBe("Melbourne");
    expect(router.current.get().chain).toHaveLength(2);
  });

  it("supports basenames and route lifecycle cleanup", async () => {
    installWindow("/console");
    const events: string[] = [];
    const routes: Route[] = [{
      path: "/",
      component: () => [],
      enter: () => {
        events.push("enter-home");
        return () => events.push("cleanup-home");
      },
      leave: () => {
        events.push("leave-home");
      }
    }, {
      path: "/city/:city",
      component: () => [],
      enter: (context) => {
        events.push(`enter-${context.params.city}`);
      }
    }];
    const router = createRouter(routes, { basename: "/console" });
    const stop = router.start();
    await Promise.resolve();

    expect(router.link("/city/Tokyo").href).toBe("/console/city/Tokyo");
    router.navigate("/city/Tokyo");
    await Promise.resolve();

    expect(globalThis.window.location.pathname).toBe("/console/city/Tokyo");
    expect(router.current.get().context.path).toBe("/city/Tokyo");
    expect(events).toEqual(["enter-home", "cleanup-home", "leave-home", "enter-Tokyo"]);
    stop();
  });
});
