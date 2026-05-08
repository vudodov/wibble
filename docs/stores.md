# Stores

Wibble stores are feature modules, not atom graphs. A store owns related state, derived values, resources, and actions behind a typed `provide/use` boundary.

```wibble
store IncidentStore

state
  selectedId: string = ""
  filters: string[] = []

resource list
  key: ["incidents", filters]
  load: api.incidents.list(filters, abortSignal)

derived
  hasSelection: boolean = selectedId.length > 0

actions
  select(id: string)
    selectedId = id
```

`@wibble/store` adds production helpers around this pattern:

- `defineStore` creates typed context-backed stores.
- `persistentSignal` keeps store fields in local or session storage.
- `createKeyedStore` materializes route or entity scoped store instances.
- `createStoreResource` uses the same resource cache semantics as components.
- `createListModel` gives list screens a typed load/add/update/remove workflow.
- `runStoreAction` and `subscribeStoreActions` expose an action timeline for tests and devtools.

Components subscribe to individual fields by reading signals in view bindings. Writes stay inside store actions, so cross-component state remains searchable and reviewable.
