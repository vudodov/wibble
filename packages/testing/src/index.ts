import { mount, type Component, type MountHandle } from "@wibble/core";

export interface RenderResult extends MountHandle {
  readonly container: HTMLElement;
}

export function render<P>(component: Component<P>, props: P): RenderResult {
  const container = document.createElement("div");
  document.body.append(container);
  const handle = mount(component, container, props);

  return {
    container,
    scope: handle.scope,
    dispose() {
      handle.dispose();
      container.remove();
    }
  };
}

export async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}
