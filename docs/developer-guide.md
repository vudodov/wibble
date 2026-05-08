# Wibble Developer Guide

Wibble is a TypeScript-first framework for building browser apps with explicit component structure. It uses `.wib` files, a compiler, and a small fine-grained runtime.

The framework is still experimental, but the shape is intentional: components should make it obvious where data comes from, where state changes happen, and what the UI renders.

## When To Use It

Wibble fits best when an app has a lot of product logic and the code needs to stay easy to review over time:

- internal tools and dashboards
- data-heavy screens
- apps with typed API clients
- apps with shared feature state
- teams that want a consistent way to write components

## Component Files

A component is split into named sections:

```wibble
component Counter

state
  count: number = 0

derived
  doubled: number = count * 2

actions
  increment()
    count = count + 1

view
  button on click -> increment
    text "Count {count}, doubled {doubled}"
```

Each section has one job:

- `use` imports dependencies.
- `props` declares public inputs.
- `state` declares local mutable state.
- `derived` declares pure computed values.
- `resource` declares async reads.
- `actions` contains mutations and imperative workflows.
- `effects` contains synchronous reactive side effects.
- `view` describes DOM and child components.

This structure keeps common changes close to their intent. A change in `resource` is about data loading. A change in `actions` is about behavior. A change in `view` is about rendered structure.

## Why `.wib`

Wibble uses a small DSL so the compiler can enforce framework rules before runtime:

- API reads live in `resource` blocks.
- State writes happen in `actions`.
- Derived values stay synchronous and pure.
- Lists declare stable keys.
- Native form bindings are checked.
- View syntax stays deterministic.

Generated TypeScript is meant to be readable, but application code should usually stay in `.wib` files.

## Rendering

Wibble does not use a virtual DOM. The compiler emits DOM creation code and reactive bindings.

At runtime:

1. A signal changes from an action, store, form, or resource.
2. Dependent computed values and bindings are scheduled in a microtask.
3. Only DOM bindings that read the changed value update.
4. Component and branch scopes clean up subscriptions when they unmount.

```wibble
state
  name: string = "Ada"

view
  h1 text "Hello {name}"
```

That creates one text node and updates that text node when `name` changes.

## API Requests

Reads belong in `resource` blocks:

```wibble
component UserPanel

use
  import { getUser, renameUser } from "./api"

props
  userId: string

resource user
  key: ["user", userId]
  load: getUser(userId, abortSignal)
  staleTime: 30000
  retry: 1

actions
  async rename(name: string)
    await renameUser(userId, name)
    invalidate user

view
  if user.loading
    p text "Loading user"
  else if user.error
    p text "{user.error}"
  else
    h2 text "{user.data.name}"
```

Resources provide stable keys, in-flight dedupe, stale-time reads, retries, aborts, late response protection, and explicit invalidation.

Mutations belong in `actions`. Actions can call typed clients, update local state, call store actions, and invalidate resources.

For shared HTTP behavior, use `@wibble/http`:

```ts
import { createHttpClient, headersInterceptor } from "@wibble/http";

export const api = createHttpClient({
  baseUrl: "/api",
  retry: { attempts: 2 },
  interceptors: [
    headersInterceptor(() => ({ "x-app-region": currentRegion() }))
  ]
});
```

## Local State

Use component `state` for local UI state:

```wibble
state
  editing: boolean = false
  draftName: string = ""

actions
  startEditing()
    draftName = user.data.name
    editing = true

  cancelEditing()
    editing = false
```

State writes are allowed only inside actions.

## Shared State

Use Wibble stores for state shared across a feature.

```wibble
store CartStore

state
  items: CartItem[] = []

derived
  count: number = items.length

actions
  add(item: CartItem)
    items = append(items, item)

  clear()
    items = []
```

Stores group related state, derived values, resources, and actions behind a typed boundary. They are feature modules, not atom graphs.

Components consume stores explicitly:

```wibble
component CartButton

use
  import { CartStore } from "../state/CartStore.wib"

state
  cart: CartStoreInstance = CartStore.use()

view
  button text "Cart {cart.count}"
```

Use props for direct parent-child data, slots for layout customization, stores for shared feature state, and context for stable services.

## Forms

Use `@wibble/forms` for typed field state.

```wibble
component SearchForm

use
  import { createField, createForm } from "@wibble/forms"
  import type { Field, Form } from "@wibble/forms"

state
  query: Field<string> = createField("")
  includeArchived: Field<boolean> = createField(false)
  form: Form<{ query: Field<string>, includeArchived: Field<boolean> }> = createForm({ query, includeArchived })

actions
  submit()
    search(form.values())

view
  section
    input bind value query placeholder "Search"
    label
      input type "checkbox" bind checked includeArchived
      text "Include archived"
    button type "button" on click -> submit
      text "Search"
```

Native bindings:

- `bind value` for `input`, `textarea`, and `select`
- `bind checked` for checkboxes
- `bind group` for radio inputs
- `bind files` for file inputs

`@wibble/ui` controls use the same field model.

## Routing

`@wibble/router` handles nested layouts, params, redirects, lazy routes, route resources, and route lifecycle hooks.

```ts
import { createRouter } from "@wibble/router";
import Layout from "./pages/Layout.wib";
import HomePage from "./pages/HomePage.wib";
import UserPage from "./pages/UserPage.wib";
import NotFoundPage from "./pages/NotFoundPage.wib";

export const router = createRouter([
  {
    path: "/",
    component: Layout,
    children: [
      { path: "/", component: HomePage },
      {
        path: "users/:userId",
        component: UserPage,
        enter: ({ params }) => console.log("open user", params.userId)
      },
      {
        path: "settings",
        lazy: () => import("./pages/SettingsPage.wib")
      }
    ]
  }
], {
  basename: "/app",
  notFound: { path: "*", component: NotFoundPage }
});
```

Use route resources for screen-level data. Use component resources for nested or interaction-driven data.

## UI Components

`@wibble/ui` contains Wibble-owned controls for product apps. It is not an adapter to a specific external design system.

```wibble
component IncidentTable

use
  import { DataTable, Callout, Spinner } from "@wibble/ui"
  import { incidentColumns } from "./columns"

props
  incidents: Incident[]
  loading: boolean
  error: string

view
  if loading
    Spinner label "Loading incidents"
  else if error
    Callout tone "danger" title "Could not load incidents"
      text "{error}"
  else
    DataTable rows incidents columns incidentColumns rowKey incidentKey
```

Use native HTML when explicit markup is clearer. Use `@wibble/ui` when you want reusable accessible controls with stable class names.

## Runtime Escape Hatches

Most application code should use sections, resources, stores, and bindings. When you need direct DOM integration, use named runtime helpers instead of query selectors.

```wibble
component FocusPanel

use
  import { createRef } from "@wibble/core"
  import type { Ref } from "@wibble/core"

state
  inputRef: Ref<HTMLInputElement> = createRef()

view
  input ref inputRef placeholder "Focused after mount"
```

The runtime also exposes `onMount`, `autoFocus`, `renderPortal`, and observer helpers for lower-level TypeScript components.

```ts
import { autoFocus, bindRef, createRef, element, onMount, type Component } from "@wibble/core";

export const FocusInput: Component = () => {
  const inputRef = createRef<HTMLInputElement>();
  const input = bindRef(inputRef, element("input"));

  onMount(() => {
    if (inputRef.current) {
      return autoFocus(inputRef.current);
    }
    return undefined;
  });

  return input;
};
```

## Devtools

`@wibble/devtools` provides an event timeline for development and tests.

```ts
import { createDevtoolsTimeline, installWibbleDevtools } from "@wibble/devtools";
import { router } from "./routing";

const timeline = createDevtoolsTimeline();
const stop = installWibbleDevtools({ router });
```

It can capture store actions, HTTP lifecycle events, route transitions, and route errors. Devtools are optional and only included when imported.

## Project Layout

A typical Wibble app might look like this:

```text
src/
  api/
    client.ts
    users.ts
  components/
    Panel.wib
    UserCard.wib
  pages/
    Layout.wib
    UsersPage.wib
    UserDetailsPage.wib
  state/
    UserStore.wib
  routing.ts
  main.ts
```

Useful conventions:

- Put HTTP transport in `api/client.ts`.
- Put API operation functions in feature API files.
- Put screen-level data in route resources.
- Put component-level data in component resources.
- Put shared feature state in `.wib` stores.
- Keep component state local until multiple components need it.
- Prefer slots over pass-through props for layout customization.
- Prefer actions over inline imperative code.

## Reading Changes

Wibble files are meant to be scanned by section:

- `props`: public component contract
- `resource`: async reads
- `state`: local mutable model
- `derived`: pure calculations
- `actions`: mutation workflows
- `effects`: synchronous side effects
- `view`: rendered structure
- `style`: presentation

Generated `.wib.d.ts` files expose component and store APIs to TypeScript and editors.

## Mental Model

- Data comes in through props, stores, routes, or resources.
- State changes happen through actions.
- Async reads happen through resources.
- Views compile to direct DOM bindings.
- Stores model product features.
- Escape hatches are explicit and named.
