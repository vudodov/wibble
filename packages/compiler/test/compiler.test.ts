import { describe, expect, it } from "vitest";
import { compileWib, formatWib } from "../src";

describe("compiler", () => {
  it("emits a component from a simple .wib file", () => {
    const result = compileWib(`component Counter

state
  count: number = 0

derived
  doubled: number = count * 2

actions
  increment()
    count = count + 1

view
  button on click -> increment
    text "Count {count}"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("export const Counter");
    expect(result.code).toContain("count.set(count.get() + 1)");
    expect(result.code).toContain("createText(() => `Count ${count.get()}`)");
  });

  it("rejects API reads in view sections", () => {
    const result = compileWib(`component Bad

view
  p text fetch("/api")
`);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "WIB_API_LOCATION")).toBe(true);
  });

  it("formats sections in deterministic order", () => {
    const result = formatWib(`component Example

view
  text "Hi"

state
  ready: boolean = true
`);

    expect(result.code.indexOf("state")).toBeLessThan(result.code.indexOf("view"));
  });

  it("emits imports and reactive props for child components", () => {
    const result = compileWib(`component App

use
  import Child from "./Child.wib"

state
  count: number = 0

view
  Child value count
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("import Child from \"./Child.wib\";");
    expect(result.code).toContain("renderComponent(Child, { value: () => count.get() })");
  });

  it("emits imported helpers and singleton exports for stores", () => {
    const result = compileWib(`store AppStore

use
  import { countryForCity } from "./helpers"

state
  selectedCity: string = "Melbourne"

derived
  selectedCountry: string = countryForCity(selectedCity)

actions
  selectCity(city: string)
    selectedCity = city
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("import { countryForCity } from \"./helpers\";");
    expect(result.code).toContain("countryForCity(selectedCity.get())");
    expect(result.code).toContain("export const appStore = AppStore.create();");
  });

  it("emits conditionals, keyed lists, slots, and form bindings", () => {
    const result = compileWib(`component Rich

use
  import Child from "./Child.wib"
  import type { Field } from "@wibble/forms"

state
  items: string[] = ["a"]
  nameField: Field<string> = field
  ready: boolean = true

view
  Child value "x"
    slot actions
      button text "Act"
  if ready
    for item in items key item
      input bind value nameField placeholder item
  else
    text "Empty"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("conditional(fragment");
    expect(result.code).toContain("keyedEach(fragment");
    expect(result.code).toContain("renderComponent(Child");
    expect(result.code).toContain("\"actions\": () =>");
    expect(result.code).toContain("bindInput");
  });

  it("emits default form control bindings for select, radio, and file inputs", () => {
    const result = compileWib(`component Controls

use
  import type { Field } from "@wibble/forms"

state
  choiceField: Field<string> = choice
  fileField: Field<File[]> = files

view
  select bind value choiceField
    option value "one" text "One"
  input type "radio" value "one" bind group choiceField
  input type "file" bind files fileField
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("bindInput");
    expect(result.code).toContain("bindRadioGroup");
    expect(result.code).toContain("bindFiles");
  });

  it("emits refs as explicit Wibble DOM escape hatches", () => {
    const result = compileWib(`component WithRef

use
  import { createRef, type Ref } from "@wibble/core"

state
  panelRef: Ref<HTMLDivElement> = createRef()

view
  div ref panelRef
    text "Panel"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("bindRef(panelRef.get()");
  });

  it("diagnoses invalid native element usage without blocking custom elements", () => {
    const result = compileWib(`component BadHtml

view
  mysterybox on tapped -> save
  custom-widget value "ok"
  input bind group field
`);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "WIB_HTML_ELEMENT")).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "WIB_HTML_EVENT")).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "WIB_FORM_BINDING_TARGET")).toBe(true);
  });

  it("emits declaration output for .wib modules", () => {
    const result = compileWib(`component Card

props
  title: string

view
  h2 text "{title}"
`);

    expect(result.declarations.code).toContain("export interface CardProps");
    expect(result.declarations.code).toContain("title: MaybeReadable<string>");
    expect(result.declarations.code).toContain("slots?: WibbleSlots");
  });
});
