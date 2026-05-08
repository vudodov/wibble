import { describe, expect, it } from "vitest";
import { emitHttpEvent } from "@wibble/http";
import { runStoreAction } from "@wibble/store";
import { createDevtoolsTimeline, installHttpDevtools, installStoreDevtools } from "../src";

describe("devtools bridges", () => {
  it("captures store and HTTP events in one timeline", async () => {
    const timeline = createDevtoolsTimeline();
    const stopStore = installStoreDevtools();
    const stopHttp = installHttpDevtools();

    await runStoreAction("ExampleStore", "save", () => undefined);
    emitHttpEvent({
      phase: "success",
      method: "GET",
      url: "https://api.example.test/items",
      requestId: "request-1",
      status: 200
    });

    stopHttp();
    stopStore();
    timeline.dispose();

    expect(timeline.events.some((event) => event.type === "store" && event.name === "ExampleStore.save")).toBe(true);
    expect(timeline.events.some((event) => event.type === "resource" && event.name.includes("https://api.example.test/items"))).toBe(true);
  });
});
