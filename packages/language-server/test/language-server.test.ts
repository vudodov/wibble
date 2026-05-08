import { describe, expect, it } from "vitest";
import { getCompletions, getDefinition, getDiagnostics, getDocumentSymbols, getHover } from "../src";

describe("language service", () => {
  it("returns keyword hover and completions", () => {
    expect(getHover("resource")?.contents).toContain("API");
    expect(getCompletions().some((item) => item.label === "view")).toBe(true);
    expect(getCompletions().some((item) => item.label === "for")).toBe(true);
  });

  it("returns diagnostics", () => {
    const diagnostics = getDiagnostics("component Bad\n\nview\n  p text fetch('/api')\n");
    expect(diagnostics.some((diagnostic) => diagnostic.code === "WIB_API_LOCATION")).toBe(true);
  });

  it("returns symbols and local definitions", () => {
    const source = "component Good\n\nstate\n  count: number = 0\n\nactions\n  increment()\n    count = count + 1\n";
    expect(getDocumentSymbols(source).map((symbol) => symbol.name)).toContain("count");
    expect(getDefinition(source, "increment")?.kind).toBe("action");
  });
});
