import { describe, expect, it } from "vitest";
import { batch, computed, effect, signal } from "../src";

describe("reactivity", () => {
  it("updates computed values from signals", async () => {
    const count = signal(1);
    const doubled = computed(() => count.get() * 2);

    expect(doubled.get()).toBe(2);
    count.set(2);
    await Promise.resolve();
    expect(doubled.get()).toBe(4);
  });

  it("batches effects into a microtask", async () => {
    const count = signal(0);
    let runs = 0;

    effect(() => {
      count.get();
      runs += 1;
    });

    batch(() => {
      count.set(1);
      count.set(2);
    });

    expect(runs).toBe(1);
    await Promise.resolve();
    expect(runs).toBe(2);
  });
});
