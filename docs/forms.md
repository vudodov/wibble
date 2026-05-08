# Forms

`@wibble/forms` provides typed field and form primitives.

```wibble
use
  import { createField, createForm } from "@wibble/forms"
  import type { Field, Form } from "@wibble/forms"

state
  city: Field<string> = createField("Melbourne", [requiredCity])
  form: Form<{ city: Field<string> }> = createForm({ city })

view
  input bind value city placeholder "City"
```

Fields track value, dirty state, touched state, validation errors, and submit state.

Native bindings:

- `bind value field` for `input`, `textarea`, and `select`
- `bind checked field` for checkbox inputs
- `bind group field` for radio inputs with `type "radio"`
- `bind files field` for file inputs with `type "file"`

Invalid binding targets are compiler diagnostics. For repeated fields, use `createFieldArray`. For higher-level controls, use `@wibble/ui` components that bind to the same field contract.
