# Resources

Resources are Wibble's API-read primitive. In browser apps, requests run on the client.

```wibble
resource report
  key: ["weather", city]
  load: loadCityReport(city, abortSignal)
  staleTime: 30000
  retry: 1
  refetchOnWindowFocus: true
```

A resource exposes `data`, `error`, `status`, `loading`, `refreshing`, `key`, `reload`, and `invalidate`.

The runtime handles:

- shared cache keys
- in-flight request dedupe
- stale-time reads
- retry attempts
- aborts for superseded local requests
- late response protection
- explicit cache invalidation through `invalidateResourceCache`

The compiler rejects API reads from `view` and `derived`. Put reads in resources and writes in actions.

`@wibble/http` fits this model:

- resources call `client.get()` or `client.request()` from `load`,
- actions call mutation methods such as `client.post()`,
- interceptors handle auth, request signing, tracing, ETags, and default headers,
- lifecycle events can feed tests, telemetry, and devtools.
