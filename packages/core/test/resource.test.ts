import { describe, expect, it } from "vitest";
import { createResource } from "../src";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("resources", () => {
  it("dedupes normal reloads while a request is already in flight", async () => {
    const loads: Array<Deferred<string> & { signal: AbortSignal }> = [];
    const resource = createResource({
      immediate: false,
      key: () => ["dedupe"],
      load: ({ signal }) => {
        const request = Object.assign(deferred<string>(), { signal });
        loads.push(request);
        return request.promise;
      }
    });

    const first = resource.reload();
    const second = resource.reload();

    expect(loads).toHaveLength(1);
    expect(loads[0]?.signal.aborted).toBe(false);
    loads[0]?.resolve("ok");

    await expect(first).resolves.toBe("ok");
    await expect(second).resolves.toBe("ok");
    expect(resource.data.get()).toBe("ok");
  });

  it("forces a fresh request when a resource is invalidated", async () => {
    const loads: Array<Deferred<string> & { signal: AbortSignal }> = [];
    const resource = createResource({
      immediate: false,
      key: () => ["invalidate"],
      load: ({ signal }) => {
        const request = Object.assign(deferred<string>(), { signal });
        loads.push(request);
        return request.promise;
      }
    });

    void resource.reload();
    await tick();
    const invalidated = resource.invalidate();

    expect(loads).toHaveLength(2);
    expect(loads[0]?.signal.aborted).toBe(true);
    expect(loads[1]?.signal.aborted).toBe(false);

    loads[0]?.resolve("stale");
    loads[1]?.resolve("fresh");
    await invalidated;
    await tick();

    expect(resource.data.get()).toBe("fresh");
  });
});
