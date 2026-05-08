import { describe, expect, it } from "vitest";
import { bindRef, createRef, createScope, onMount } from "../src";

describe("dom helpers", () => {
  it("clears refs when their owning scope is disposed", () => {
    const scope = createScope();
    const ref = createRef<Element>();
    const element = {} as Element;

    scope.run(() => bindRef(ref, element));

    expect(ref.current).toBe(element);
    scope.dispose();
    expect(ref.current).toBeUndefined();
  });

  it("runs mount work after the current microtask and cleans it up with scope disposal", async () => {
    const scope = createScope();
    const events: string[] = [];

    scope.run(() => {
      onMount(() => {
        events.push("mounted");
        return () => events.push("disposed");
      });
    });

    expect(events).toEqual([]);
    await Promise.resolve();
    expect(events).toEqual(["mounted"]);
    scope.dispose();
    expect(events).toEqual(["mounted", "disposed"]);
  });
});
