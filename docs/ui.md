# UI

`@wibble/ui` provides generic Wibble-owned controls for product apps: buttons, inputs, text areas, selects, checkboxes, radio groups, form fields, dialogs, tabs, callouts, spinners, data tables, virtual lists, toast regions, and progress bars.

The package is intentionally not an adapter layer. Components return normal DOM nodes, use Wibble signals and slots, and expose stable class names such as `wib-button` and `wib-dialog` so apps can theme them.

```wibble
use
  import { Button, FormField, Select } from "@wibble/ui"

view
  FormField label "Region" field form.fields.region
    Select field form.fields.region options regionOptions
  Button tone "primary" label "Save" on click -> save
```

Default HTML stays available directly in `.wib` files. Use `@wibble/ui` when you want an opinionated accessible control; use native elements when the markup should be completely explicit in the component.

For dense operational screens, use `DataTable` with explicit columns and stable row keys. For very large lists, use `VirtualList` with a fixed row height. These primitives keep list identity and rendering behavior obvious in review.
