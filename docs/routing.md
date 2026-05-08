# Routing

`@wibble/router` supports nested routes, params, query strings, redirects, lazy route components, route resources, prefetch, basenames, route lifecycle hooks, route errors, and not-found routes.

```ts
export const router = createRouter([
  {
    path: "/",
    component: Layout,
    children: [
      { path: "/", component: Home, load: () => loadHome() },
      {
        path: "city/:city",
        component: CityPage,
        enter: ({ params }) => openCityStore(params.city),
        leave: ({ params }) => closeCityStore(params.city)
      },
      { path: "legacy", redirect: "/" },
      { path: "lazy", lazy: () => import("./LazyPage.wib") }
    ]
  }
], {
  basename: "/console",
  notFound: { path: "*", component: NotFoundPage }
});
```

Parent route components act as layouts. The router passes the rendered child route through the parent component's `default` slot. Route loaders become resources and can be inspected through `router.current.get().resource` or named `resources`.

Use `enter` for route-scoped setup such as feature stores, subscriptions, and focus restoration. It may return a cleanup function. Use `leave` for explicit teardown and analytics. Lazy and lifecycle errors surface through `router.error` and render the nearest route `errorComponent` when one is declared.
