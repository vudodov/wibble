import { getCurrentScope, type Scope } from "./reactivity";

export interface ContextToken<T> {
  readonly name: string;
  readonly id: symbol;
}

type ContextFrame = Map<symbol, unknown>;
export type ContextSnapshot = ReadonlyMap<symbol, unknown>;

const scopeFrames = new WeakMap<Scope, ContextFrame>();
let currentFrame: ContextFrame | undefined;

function activeFrame(): ContextFrame | undefined {
  const scope = getCurrentScope();
  return currentFrame ?? (scope ? scopeFrames.get(scope) : undefined);
}

export function createContext<T>(name: string): ContextToken<T> {
  return { name, id: Symbol(name) };
}

export function provide<T>(token: ContextToken<T>, value: T): void {
  const frame = activeFrame();
  if (!frame) {
    throw new Error(`Cannot provide ${token.name} outside a Wibble component scope.`);
  }

  frame.set(token.id, value);
}

export function useContext<T>(token: ContextToken<T>): T {
  const frame = activeFrame();
  if (frame?.has(token.id)) {
    return frame.get(token.id) as T;
  }

  throw new Error(`Missing Wibble context provider for ${token.name}.`);
}

export function captureContextFrame(): ContextSnapshot | undefined {
  const frame = activeFrame();
  return frame ? new Map(frame) : undefined;
}

export function withContextFrame<T>(work: () => T, parentFrame: ContextSnapshot | undefined = activeFrame()): T {
  const frame = new Map(parentFrame);
  const previous = currentFrame;
  const scope = getCurrentScope();
  currentFrame = frame;
  if (scope) {
    scopeFrames.set(scope, frame);
    scope.add(() => {
      if (scopeFrames.get(scope) === frame) {
        scopeFrames.delete(scope);
      }
    });
  }

  try {
    return work();
  } finally {
    currentFrame = previous;
  }
}
