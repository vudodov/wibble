import { describe, expect, it } from "vitest";
import { createField, createFieldArray, createForm } from "../src";

describe("forms", () => {
  it("tracks validity and dirty state", async () => {
    const name = createField("", [(value) => value ? undefined : "Required"]);
    const form = createForm({ name });

    expect(form.valid.get()).toBe(false);
    name.set("Ada");
    await Promise.resolve();
    expect(form.valid.get()).toBe(true);
    expect(form.dirty.get()).toBe(true);
  });

  it("submits values only when valid", async () => {
    const name = createField("", [(value) => value ? undefined : "Required"]);
    const form = createForm({ name });
    const submitted: string[] = [];

    expect(await form.submit((values) => {
      submitted.push(values.name);
    })).toBe(false);

    name.set("Ada");
    await Promise.resolve();
    expect(await form.submit((values) => {
      submitted.push(values.name);
    })).toBe(true);

    expect(submitted).toEqual(["Ada"]);
    expect(form.submitting.get()).toBe(false);
  });

  it("tracks repeatable field arrays", async () => {
    const array = createFieldArray([{ id: "a" }]);

    array.append({ id: "b" });
    array.update(0, { id: "alpha" });
    array.remove(1);
    await Promise.resolve();

    expect(array.items.get()).toEqual([{ id: "alpha" }]);
    expect(array.dirty.get()).toBe(true);
  });
});
