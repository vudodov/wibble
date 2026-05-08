import { describe, expect, it } from "vitest";
import { renderToString } from "../src";

describe("ssr", () => {
  it("reports manifest assets without requiring a DOM adapter", () => {
    const result = renderToString(() => [], {}, {
      entry: "src/main.ts",
      manifest: {
        "src/main.ts": {
          file: "assets/main.js",
          css: ["assets/main.css"]
        }
      }
    });

    expect(result.assets).toEqual(["assets/main.js", "assets/main.css"]);
    expect(result.html).toContain("wibble:ssr requires a DOM adapter");
  });
});
