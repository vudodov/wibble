# UI

`@wibble/ui` provides reusable controls for Wibble apps: buttons, inputs, text areas, selects, checkboxes, radio groups, form fields, dialogs, tabs, callouts, spinners, data tables, virtual lists, toast regions, and progress bars.

The package is not an adapter to an external design system. Components return normal DOM nodes, use Wibble signals and slots, and expose stable class names such as `wib-button` and `wib-dialog` for theming.

```wibble
use
  import { Button, FormField, Select } from "@wibble/ui"

view
  FormField label "Region" field form.fields.region
    Select field form.fields.region options regionOptions
  Button tone "primary" label "Save" on click -> save
```

Native HTML remains available in `.wib` files. Use `@wibble/ui` for reusable accessible controls; use native elements when explicit markup is clearer.

For dense screens, use `DataTable` with explicit columns and stable row keys. For large lists, use `VirtualList` with a fixed row height.
