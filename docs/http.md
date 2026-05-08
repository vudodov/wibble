# HTTP

`@wibble/http` is a small request layer for Wibble resources and actions. It centralizes base URLs, retries, headers, request ids, ETags, and lifecycle events.

```ts
import { createHttpClient, eTagCacheInterceptor, headersInterceptor } from "@wibble/http";

export const api = createHttpClient({
  baseUrl: "https://api.example.com",
  retry: { attempts: 2 },
  interceptors: [
    headersInterceptor(() => ({ authorization: `Bearer ${token()}` })),
    eTagCacheInterceptor()
  ]
});
```

Use it from resources for reads:

```wibble
resource incidents
  key: ["incidents", region]
  load: listIncidents(api, region, abortSignal)
```

Use it from actions for mutations, then invalidate the affected resources.

The client emits lifecycle events with method, URL, request id, status, and phase. Tests, telemetry, and devtools can subscribe to those events without wrapping components.
