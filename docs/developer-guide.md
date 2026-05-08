# Wibble Developer Guide

Wibble is a TypeScript-first framework for building browser apps whose source code should be easy for humans and AI agents to change safely.

It is not trying to be a smaller React clone. The goal is different: make application intent visible in the source, move common mistakes into compiler diagnostics, and keep generated changes easy to review in pull requests.

## What Wibble Is For

Wibble is for product-style SPAs where correctness, reviewability, and maintainability matter more than maximum freedom in every component.

Good fits:

- internal tools and operational dashboards,
- data-heavy product screens,
- apps with typed API clients and shared feature state,
- teams using AI agents to create or modify UI code,
- codebases where reviewers need to quickly understand what changed.

Less ideal fits:

- highly experimental UI where arbitrary JavaScript in templates is the main workflow,
- apps that need SSR-first production support today,
- projects that want to assemble many unrelated third-party state and routing models.

Wibble is opinionated on purpose. It gives you one official component format, one resource model, one store model, one router, one forms package, one UI primitive package, and one compiler. That reduces the number of ways an app can accidentally become difficult to reason about.

## The Core Idea

A Wibble component is split into named sections:

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

Each section has a job:

- `props` are immutable inputs.
- `state` is local mutable state.
- `derived` is pure computed state.
- `resource` is declarative API reads.
- `actions` are mutations and imperative workflows.
- `view` is DOM and component structure.
- `use` imports dependencies explicitly.

This makes diffs readable. If a PR changes `resource`, the reviewer knows API behavior changed. If it changes `actions`, the reviewer knows mutation behavior changed. If it changes only `view`, the reviewer knows the shape of the UI changed.

## Why A DSL?

Wibble uses `.wib` files because ordinary component code is too open-ended for the framework rules Wibble wants to enforce.

In Wibble:

- API reads cannot hide in render code.
- State mutation cannot happen from random expressions.
- Lists must have stable keys.
- Native form bindings are checked.
- Component source order is stable.
- Generated TypeScript is deterministic.

That matters for AI-generated work. AI agents can modify small, named sections, and humans can review the intent without mentally executing arbitrary component code.

## Rendering Model

Wibble does not use a virtual DOM. The compiler emits direct DOM creation and fine-grained bindings.

At runtime:

1. A signal changes from an action, store, form, or resource.
2. Dependent computed values and bindings are scheduled in a microtask.
3. Only DOM nodes that read the changed value update.
4. Component and branch scopes clean up effects when unmounted.

You write:

```wibble
state
  name: string = "Ada"

view
  h1 text "Hello {name}"
```

The compiler emits code that creates one text node and updates that node when `name` changes. It does not re-run the whole component tree.

## API Requests

API reads belong in `resource` blocks.

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

Resources give Wibble one place to reason about async reads. They provide stable keys, in-flight dedupe, stale-time reads, retries, aborts, and explicit invalidation.

API mutations belong in `actions`. Actions may call typed clients, update state, call store actions, and invalidate resources.

For production clients, use `@wibble/http`:

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

Use component `state` for local UI concerns:

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

State writes are allowed only in `actions`, which keeps mutations searchable.

## Shared State

Use Wibble stores for feature state shared by multiple components.

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

Stores are feature modules, not atom graphs. They group related state, derived values, resources, and actions behind a typed boundary.

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

Supported native bindings:

- `bind value` for `input`, `textarea`, and `select`
- `bind checked` for checkboxes
- `bind group` for radio inputs
- `bind files` for file inputs

Use `@wibble/ui` when you want higher-level controls that still bind to the same field model.

## Routing

Use the official router for nested layouts, params, redirects, lazy routes, route resources, and route lifecycle.

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

Route-level data should use route resources. Component resources are for nested or interaction-driven data.

## UI Components

`@wibble/ui` contains Wibble-owned controls for product apps. It is not an adapter to a specific third-party design system.

Example:

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

Use native HTML when explicit markup is clearer. Use `@wibble/ui` when you want consistent, accessible controls with stable class names.

## Runtime Escape Hatches

Most code should use Wibble sections, resources, stores, and bindings. When you need direct DOM integration, use explicit runtime helpers instead of query selectors.

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

Refs make imperative integration points visible. For lower-level TypeScript components or package code, the runtime also exposes `onMount`, `autoFocus`, `renderPortal`, and observer helpers:

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

Refs, portals, observers, and mount hooks are intentionally explicit so reviewers can find imperative behavior quickly.

## Devtools And Observability

`@wibble/devtools` provides a unified event stream for development and tests.

```ts
import { createDevtoolsTimeline, installWibbleDevtools } from "@wibble/devtools";
import { router } from "./routing";

const timeline = createDevtoolsTimeline();
const stop = installWibbleDevtools({ router });
```

It can capture store actions, HTTP lifecycle events, route transitions, and route errors. Devtools are optional and imported only when you choose to install them.

## How To Structure An App

A typical Wibble app looks like this:

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

Recommended rules:

- Put HTTP transport in `api/client.ts`.
- Put API operation functions in feature API files.
- Put screen-level data in route resources.
- Put component-level data in component resources.
- Put shared feature state in `.wib` stores.
- Keep component state local until two or more components genuinely need it.
- Prefer slots over pass-through props for layout customization.
- Prefer actions over inline imperative code.

## Reviewing Wibble PRs

Wibble is designed so reviewers can scan changes by section:

- `props`: public component contract changed.
- `resource`: API read behavior changed.
- `state`: local mutable model changed.
- `derived`: pure calculation changed.
- `actions`: mutation workflow changed.
- `view`: UI structure changed.
- `style`: presentation changed.

Generated `.wib.d.ts` files make component/store APIs visible to TypeScript and editors. The compiler output is deterministic, so repeated formatting or generation should not create noisy diffs.

## Mental Model

The shortest version:

- Data comes in through props, stores, routes, or resources.
- State changes happen through actions.
- Async reads happen through resources.
- The compiler turns views into direct DOM bindings.
- Stores model product features, not isolated atoms.
- Escape hatches are explicit and named.
- The framework chooses fewer paths so humans and AI agents make fewer surprising changes.

Wibble is for teams that want the framework to be a strict collaborator: a little less freedom up front, a lot more clarity when the app grows.
