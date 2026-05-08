# HTTP

`@wibble/http` is the Wibble-native request layer for resources and actions. It keeps API behavior explicit without forcing every app to rebuild clients, retries, signing, and telemetry from scratch.

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

Reads belong in `resource` blocks:

```wibble
resource incidents
  key: ["incidents", region]
  load: listIncidents(api, region, abortSignal)
```

Mutations belong in actions, followed by explicit invalidation. The client emits request lifecycle events with method, URL, request id, status, and phase so tests, telemetry, and devtools can observe behavior without wrapping components.
