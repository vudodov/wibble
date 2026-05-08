# Resources

API reads belong in `resource` blocks. Requests run in the browser in the current SPA target.

```wibble
resource report
  key: ["weather", city]
  load: loadCityReport(city, abortSignal)
  staleTime: 30000
  retry: 1
  refetchOnWindowFocus: true
```

Resources expose `data`, `error`, `status`, `loading`, `refreshing`, `key`, `reload`, and `invalidate`.

The runtime provides:

- shared cache keys and in-flight request dedupe,
- stale-time reads,
- retry attempts,
- aborts for superseded local requests,
- late response protection,
- explicit cache invalidation with `invalidateResourceCache`.

The compiler rejects API reads from `view` and `derived`; put reads in resources and mutations in actions.

For production clients, `@wibble/http` provides a small typed request layer that fits this model:

- resources call `client.get()` or `client.request()` from their `load` function,
- actions call mutation methods such as `client.post()` and then invalidate resources,
- interceptors handle auth, request signing, tracing, ETags, and default headers,
- lifecycle events feed tests, telemetry bridges, and devtools.
