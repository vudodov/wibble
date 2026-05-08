import { getCurrentScope } from "./reactivity";

export interface ContextToken<T> {
  readonly name: string;
  readonly id: symbol;
}

const stack: Array<Map<symbol, unknown>> = [];

export function createContext<T>(name: string): ContextToken<T> {
  return { name, id: Symbol(name) };
}

export function provide<T>(token: ContextToken<T>, value: T): void {
  const frame = stack.at(-1);
  if (!frame) {
    throw new Error(`Cannot provide ${token.name} outside a Wibble component scope.`);
  }

  frame.set(token.id, value);
}

export function useContext<T>(token: ContextToken<T>): T {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame?.has(token.id)) {
      return frame.get(token.id) as T;
    }
  }

  throw new Error(`Missing Wibble context provider for ${token.name}.`);
}

export function withContextFrame<T>(work: () => T): T {
  const parent = stack.at(-1);
  const frame = new Map(parent);
  stack.push(frame);

  const scope = getCurrentScope();
  scope?.add(() => {
    const index = stack.indexOf(frame);
    if (index >= 0) {
      stack.splice(index, 1);
    }
  });

  try {
    return work();
  } finally {
    if (stack.at(-1) === frame) {
      stack.pop();
    }
  }
}
