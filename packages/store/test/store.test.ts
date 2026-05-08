import { describe, expect, it } from "vitest";
import {
  createKeyedStore,
  createListModel,
  persistentSignal,
  runStoreAction,
  subscribeStoreActions
} from "../src";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

describe("store", () => {
  it("keeps persistent signals synchronized with storage", async () => {
    const storage = new MemoryStorage();
    const theme = persistentSignal("theme", "light", { storage });

    theme.set("dark");
    await Promise.resolve();

    expect(storage.getItem("theme")).toBe(JSON.stringify("dark"));
    expect(persistentSignal("theme", "light", { storage }).peek()).toBe("dark");
  });

  it("materializes stable keyed stores", () => {
    const keyed = createKeyedStore((id: string) => ({ id }));

    expect(keyed.get("a")).toBe(keyed.get("a"));
    expect(keyed.get("b").id).toBe("b");
    expect(keyed.keys()).toEqual(["a", "b"]);
    keyed.delete("a");
    expect(keyed.keys()).toEqual(["b"]);
  });

  it("wraps list workflows in Wibble signals", async () => {
    const model = createListModel<string>({
      initialItems: ["a"],
      add: (items, item) => [...items, item],
      update: (items, item) => items.map((current) => current[0] === item[0] ? item : current),
      remove: (items, item) => items.filter((current) => current !== item)
    });

    await model.add("b");
    await model.update("beta");
    await model.remove("a");

    expect(model.items.get()).toEqual(["beta"]);
    expect(model.status.get()).toBe("ready");
  });

  it("emits store action timeline events", async () => {
    const phases: string[] = [];
    const dispose = subscribeStoreActions((event) => phases.push(event.phase));

    await runStoreAction("Example", "save", () => 42);
    dispose();

    expect(phases).toEqual(["start", "success"]);
  });
});
