import { describe, expect, it } from "vitest";
import { createHttpClient, eTagCacheInterceptor, subscribeHttpEvents } from "../src";

describe("http", () => {
  it("normalizes JSON requests and emits lifecycle events", async () => {
    const events: string[] = [];
    const dispose = subscribeHttpEvents((event) => events.push(event.phase));
    const client = createHttpClient({
      baseUrl: "https://api.example.test",
      fetcher: async (input, init) => new Response(JSON.stringify({
        url: String(input),
        method: init?.method,
        body: init?.body
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    });

    const response = await client.post<{ method: string; url: string; body: string }>("/items", { name: "Ada" }, {
      query: { page: 1 }
    });

    dispose();
    expect(response.data.method).toBe("POST");
    expect(response.data.url).toBe("https://api.example.test/items?page=1");
    expect(response.data.body).toBe(JSON.stringify({ name: "Ada" }));
    expect(events).toEqual(["start", "success"]);
  });

  it("dedupes conditional responses with the ETag interceptor", async () => {
    let call = 0;
    const client = createHttpClient({
      baseUrl: "https://api.example.test",
      interceptors: [eTagCacheInterceptor()],
      fetcher: async (_input, init) => {
        call += 1;
        if ((init?.headers as Headers).get("if-none-match") === "v1") {
          return new Response(undefined, { status: 304 });
        }

        return new Response(JSON.stringify({ call }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            etag: "v1"
          }
        });
      }
    });

    expect((await client.get<{ call: number }>("/items")).data.call).toBe(1);
    expect((await client.get<{ call: number }>("/items")).data.call).toBe(1);
  });
});
