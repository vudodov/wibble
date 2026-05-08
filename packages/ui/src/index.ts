import {
  bindAttr,
  createScope,
  createText,
  effect,
  listen,
  normalizeNodes,
  onScopeDispose,
  read,
  renderSlot,
  signal,
  type Component,
  type MaybeReadable,
  type WibbleSlots
} from "@wibble/core";
import { bindCheckbox, bindInput, bindRadioGroup, type Field } from "@wibble/forms";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
export type Size = "small" | "medium" | "large";

export interface Choice<TValue extends string = string> {
  readonly label: MaybeReadable<string>;
  readonly value: TValue;
  readonly disabled?: MaybeReadable<boolean>;
}

export interface ButtonProps {
  readonly label?: MaybeReadable<string>;
  readonly tone?: MaybeReadable<Tone>;
  readonly size?: MaybeReadable<Size>;
  readonly disabled?: MaybeReadable<boolean>;
  readonly type?: MaybeReadable<"button" | "submit" | "reset">;
  readonly title?: MaybeReadable<string>;
  readonly onClick?: (event: MouseEvent) => void | Promise<void>;
  readonly slots?: WibbleSlots;
}

export interface TextInputProps {
  readonly field?: Field<string>;
  readonly value?: MaybeReadable<string>;
  readonly placeholder?: MaybeReadable<string>;
  readonly disabled?: MaybeReadable<boolean>;
  readonly required?: MaybeReadable<boolean>;
  readonly type?: MaybeReadable<"text" | "search" | "email" | "password" | "url" | "tel">;
  readonly onChange?: (value: string) => void;
}

export interface TextAreaProps extends Omit<TextInputProps, "type"> {
  readonly rows?: MaybeReadable<number>;
}

export interface SelectProps<TValue extends string = string> {
  readonly field?: Field<TValue>;
  readonly value?: MaybeReadable<TValue>;
  readonly options: MaybeReadable<readonly Choice<TValue>[]>;
  readonly placeholder?: MaybeReadable<string>;
  readonly disabled?: MaybeReadable<boolean>;
  readonly onChange?: (value: TValue) => void;
}

export interface CheckboxProps {
  readonly field?: Field<boolean>;
  readonly checked?: MaybeReadable<boolean>;
  readonly label?: MaybeReadable<string>;
  readonly disabled?: MaybeReadable<boolean>;
  readonly onChange?: (checked: boolean) => void;
}

export interface RadioGroupProps<TValue extends string = string> {
  readonly field?: Field<TValue>;
  readonly value?: MaybeReadable<TValue>;
  readonly name?: MaybeReadable<string>;
  readonly options: MaybeReadable<readonly Choice<TValue>[]>;
  readonly onChange?: (value: TValue) => void;
}

export interface FormFieldProps {
  readonly label: MaybeReadable<string>;
  readonly field?: Field<unknown>;
  readonly hint?: MaybeReadable<string>;
  readonly slots?: WibbleSlots;
}

export interface DialogProps {
  readonly open: MaybeReadable<boolean>;
  readonly title?: MaybeReadable<string>;
  readonly onClose?: () => void;
  readonly slots?: WibbleSlots;
}

export interface TabItem<TValue extends string = string> {
  readonly label: MaybeReadable<string>;
  readonly value: TValue;
}

export interface TabsProps<TValue extends string = string> {
  readonly selected: MaybeReadable<TValue>;
  readonly tabs: MaybeReadable<readonly TabItem<TValue>[]>;
  readonly onSelect: (value: TValue) => void;
}

export interface CalloutProps {
  readonly tone?: MaybeReadable<Tone>;
  readonly title?: MaybeReadable<string>;
  readonly slots?: WibbleSlots;
}

export interface TableColumn<TRow> {
  readonly id: string;
  readonly header: MaybeReadable<string>;
  readonly cell: (row: TRow) => MaybeReadable<unknown> | Node | Node[];
  readonly align?: MaybeReadable<"start" | "center" | "end">;
  readonly width?: MaybeReadable<string>;
}

export interface DataTableProps<TRow, TKey extends string | number = string | number> {
  readonly rows: MaybeReadable<readonly TRow[]>;
  readonly columns: MaybeReadable<readonly TableColumn<TRow>[]>;
  readonly rowKey: (row: TRow) => TKey;
  readonly selectedKey?: MaybeReadable<TKey | undefined>;
  readonly emptyLabel?: MaybeReadable<string>;
  readonly onRowClick?: (row: TRow) => void;
}

export interface VirtualListProps<TItem> {
  readonly items: MaybeReadable<readonly TItem[]>;
  readonly itemHeight: MaybeReadable<number>;
  readonly height: MaybeReadable<number>;
  readonly overscan?: MaybeReadable<number>;
  readonly renderItem: (item: TItem, index: number) => Node | Node[];
}

export interface Toast {
  readonly id: string;
  readonly tone?: MaybeReadable<Tone>;
  readonly title?: MaybeReadable<string>;
  readonly message: MaybeReadable<string>;
  readonly actionLabel?: MaybeReadable<string>;
  readonly onAction?: () => void;
  readonly onDismiss?: () => void;
}

export interface ToastRegionProps {
  readonly toasts: MaybeReadable<readonly Toast[]>;
}

export interface ProgressBarProps {
  readonly value: MaybeReadable<number>;
  readonly max?: MaybeReadable<number>;
  readonly label?: MaybeReadable<string>;
}

/** Generic Wibble button with stable classes and accessible disabled state. */
export const Button: Component<ButtonProps> = (props) => {
  const button = document.createElement("button");
  bindAttr(button, "class", () => classes("wib-button", `wib-button--${read(props.tone ?? "neutral")}`, `wib-button--${read(props.size ?? "medium")}`));
  bindAttr(button, "type", () => read(props.type ?? "button"));
  bindAttr(button, "disabled", () => read(props.disabled ?? false));
  bindAttr(button, "title", () => read(props.title ?? undefined));

  if (props.onClick) {
    listen(button, "click", (event) => {
      void props.onClick?.(event as MouseEvent);
    });
  }

  button.append(...renderSlot(props.slots, "default", () => createText(() => read(props.label ?? ""))));
  return button;
};

/** Text input bound either to a Wibble field or to value/onChange props. */
export const TextInput: Component<TextInputProps> = (props) => {
  const input = document.createElement("input");
  bindAttr(input, "class", "wib-input");
  bindAttr(input, "type", () => read(props.type ?? "text"));
  bindAttr(input, "placeholder", () => read(props.placeholder ?? undefined));
  bindAttr(input, "disabled", () => read(props.disabled ?? false));
  bindAttr(input, "required", () => read(props.required ?? false));
  bindTextControl(input, props);
  return input;
};

/** Multiline text area with the same field contract as TextInput. */
export const TextArea: Component<TextAreaProps> = (props) => {
  const textarea = document.createElement("textarea");
  bindAttr(textarea, "class", "wib-textarea");
  bindAttr(textarea, "placeholder", () => read(props.placeholder ?? undefined));
  bindAttr(textarea, "disabled", () => read(props.disabled ?? false));
  bindAttr(textarea, "required", () => read(props.required ?? false));
  bindAttr(textarea, "rows", () => read(props.rows ?? undefined));
  bindTextControl(textarea, props);
  return textarea;
};

/** Native select control with dynamic options and optional Wibble field binding. */
export const Select = <TValue extends string = string>(props: SelectProps<TValue>): HTMLSelectElement => {
  const select = document.createElement("select");
  bindAttr(select, "class", "wib-select");
  bindAttr(select, "disabled", () => read(props.disabled ?? false));

  if (props.field) {
    onScopeDispose(bindInput(select, props.field as Field<string>));
  }

  const onChange = () => props.onChange?.(select.value as TValue);
  select.addEventListener("change", onChange);
  onScopeDispose(() => select.removeEventListener("change", onChange));

  effect(() => {
    const options = read(props.options);
    const current = props.field ? props.field.value.get() : read(props.value ?? "");
    select.replaceChildren();

    const placeholder = read(props.placeholder ?? undefined);
    if (placeholder) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      option.disabled = true;
      select.append(option);
    }

    for (const choice of options) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = read(choice.label);
      option.disabled = read(choice.disabled ?? false);
      option.selected = choice.value === current;
      select.append(option);
    }
  });

  return select;
};

/** Checkbox with label text and optional boolean field binding. */
export const Checkbox: Component<CheckboxProps> = (props) => {
  const label = document.createElement("label");
  label.className = "wib-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  bindAttr(input, "disabled", () => read(props.disabled ?? false));

  if (props.field) {
    onScopeDispose(bindCheckbox(input, props.field));
  } else {
    effect(() => {
      input.checked = read(props.checked ?? false);
    });
  }

  const onChange = () => props.onChange?.(input.checked);
  input.addEventListener("change", onChange);
  onScopeDispose(() => input.removeEventListener("change", onChange));
  label.append(input, createText(() => read(props.label ?? "")));
  return label;
};

/** Accessible native radio group with Wibble field support. */
export const RadioGroup = <TValue extends string = string>(props: RadioGroupProps<TValue>): HTMLDivElement => {
  const group = document.createElement("div");
  group.className = "wib-radio-group";
  group.setAttribute("role", "radiogroup");
  const stableName = `wib-radio-${Math.random().toString(36).slice(2)}`;

  effect((onCleanup) => {
    const options = read(props.options);
    const name = read(props.name ?? stableName);
    group.replaceChildren();

    for (const choice of options) {
      const label = document.createElement("label");
      label.className = "wib-radio";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = choice.value;
      input.disabled = read(choice.disabled ?? false);

      if (props.field) {
        onCleanup(bindRadioGroup(input, props.field as Field<string>));
      } else {
        input.checked = choice.value === read(props.value ?? "");
      }

      const onChange = () => {
        if (input.checked) {
          props.onChange?.(choice.value);
        }
      };
      input.addEventListener("change", onChange);
      onCleanup(() => input.removeEventListener("change", onChange));
      label.append(input, createText(() => read(choice.label)));
      group.append(label);
    }
  });

  return group;
};

/** Labels a form control slot and exposes validation state through ARIA-friendly markup. */
export const FormField: Component<FormFieldProps> = (props) => {
  const field = document.createElement("div");
  field.className = "wib-form-field";
  const label = document.createElement("label");
  label.className = "wib-form-field__label";
  label.append(createText(() => read(props.label)));
  const body = document.createElement("div");
  body.className = "wib-form-field__control";
  body.append(...renderSlot(props.slots, "default", () => []));
  const helper = document.createElement("div");
  helper.className = "wib-form-field__helper";
  helper.setAttribute("aria-live", "polite");
  helper.append(createText(() => {
    const error = props.field?.error.get();
    return error ?? read(props.hint ?? "");
  }));
  field.append(label, body, helper);
  return field;
};

/** Modal-style dialog primitive that keeps markup inspectable and framework-owned. */
export const Dialog: Component<DialogProps> = (props) => {
  const backdrop = document.createElement("div");
  bindAttr(backdrop, "class", () => classes("wib-dialog", read(props.open) ? "is-open" : "is-closed"));
  bindAttr(backdrop, "hidden", () => !read(props.open));
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const panel = document.createElement("div");
  panel.className = "wib-dialog__panel";
  const title = document.createElement("h2");
  title.className = "wib-dialog__title";
  title.append(createText(() => read(props.title ?? "")));
  const body = document.createElement("div");
  body.className = "wib-dialog__body";
  body.append(...renderSlot(props.slots, "default", () => []));
  panel.append(title, body);
  backdrop.append(panel);

  if (props.onClose) {
    listen(backdrop, "click", (event) => {
      if (event.target === backdrop) {
        props.onClose?.();
      }
    });
  }

  return backdrop;
};

/** Segmented tab control for route, view, and mode switches. */
export const Tabs = <TValue extends string = string>(props: TabsProps<TValue>): HTMLDivElement => {
  const root = document.createElement("div");
  root.className = "wib-tabs";
  root.setAttribute("role", "tablist");

  effect(() => {
    const selected = read(props.selected);
    root.replaceChildren();
    for (const tab of read(props.tabs)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wib-tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.value === selected));
      button.append(createText(() => read(tab.label)));
      button.addEventListener("click", () => props.onSelect(tab.value));
      root.append(button);
    }
  });

  return root;
};

/** Status message block for errors, warnings, success states, and neutral notes. */
export const Callout: Component<CalloutProps> = (props) => {
  const root = document.createElement("section");
  bindAttr(root, "class", () => classes("wib-callout", `wib-callout--${read(props.tone ?? "neutral")}`));
  const title = document.createElement("strong");
  title.className = "wib-callout__title";
  title.append(createText(() => read(props.title ?? "")));
  const body = document.createElement("div");
  body.className = "wib-callout__body";
  body.append(...renderSlot(props.slots, "default", () => []));
  root.append(title, body);
  return root;
};

/** Small loading indicator for async boundaries and resource refresh states. */
export const Spinner: Component<{ readonly label?: MaybeReadable<string> }> = (props) => {
  const root = document.createElement("span");
  root.className = "wib-spinner";
  root.setAttribute("role", "status");
  root.append(createText(() => read(props.label ?? "Loading")));
  return root;
};

/** Data table for dense product screens with explicit columns and row identity. */
export const DataTable = <TRow, TKey extends string | number = string | number>(
  props: DataTableProps<TRow, TKey>
): HTMLTableElement => {
  const table = document.createElement("table");
  table.className = "wib-data-table";
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);

  effect((onCleanup) => {
    const renderScope = createScope();
    onCleanup(() => renderScope.dispose());
    const columns = read(props.columns);
    const rows = read(props.rows);
    const selectedKey = read(props.selectedKey ?? undefined);
    thead.replaceChildren();
    tbody.replaceChildren();

    const headerRow = document.createElement("tr");
    for (const column of columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.dataset.columnId = column.id;
      th.style.textAlign = cssAlign(read(column.align ?? "start"));
      if (column.width) {
        th.style.width = read(column.width);
      }
      th.textContent = read(column.header);
      headerRow.append(th);
    }
    thead.append(headerRow);

    if (rows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = Math.max(1, columns.length);
      td.className = "wib-data-table__empty";
      td.textContent = read(props.emptyLabel ?? "No rows");
      tr.append(td);
      tbody.append(tr);
      return;
    }

    for (const row of rows) {
      const key = props.rowKey(row);
      const tr = document.createElement("tr");
      tr.dataset.key = String(key);
      tr.setAttribute("aria-selected", String(key === selectedKey));
      if (props.onRowClick) {
        tr.tabIndex = 0;
        tr.addEventListener("click", () => props.onRowClick?.(row));
      }

      for (const column of columns) {
        const td = document.createElement("td");
        td.dataset.columnId = column.id;
        td.style.textAlign = cssAlign(read(column.align ?? "start"));
        renderScope.run(() => appendCell(td, column.cell(row)));
        tr.append(td);
      }
      tbody.append(tr);
    }
  });

  return table;
};

/** Virtualized scrolling list for large collections with fixed-height rows. */
export const VirtualList = <TItem,>(props: VirtualListProps<TItem>): HTMLDivElement => {
  const root = document.createElement("div");
  root.className = "wib-virtual-list";
  root.style.overflow = "auto";
  root.style.position = "relative";
  const spacer = document.createElement("div");
  const windowEl = document.createElement("div");
  windowEl.style.position = "absolute";
  windowEl.style.left = "0";
  windowEl.style.right = "0";
  windowEl.style.top = "0";
  root.append(spacer, windowEl);
  const scrollTop = signal(0);
  const onScroll = () => scrollTop.set(root.scrollTop);
  root.addEventListener("scroll", onScroll);
  onScopeDispose(() => root.removeEventListener("scroll", onScroll));

  effect((onCleanup) => {
    const renderScope = createScope();
    onCleanup(() => renderScope.dispose());
    const items = read(props.items);
    const itemHeight = Math.max(1, read(props.itemHeight));
    const height = Math.max(1, read(props.height));
    const overscan = Math.max(0, read(props.overscan ?? 4));
    const top = scrollTop.get();
    const start = Math.max(0, Math.floor(top / itemHeight) - overscan);
    const visible = Math.ceil(height / itemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visible);
    root.style.height = `${height}px`;
    spacer.style.height = `${items.length * itemHeight}px`;
    windowEl.style.transform = `translateY(${start * itemHeight}px)`;
    windowEl.replaceChildren();

    for (let index = start; index < end; index += 1) {
      const item = items[index];
      if (item === undefined) {
        continue;
      }

      const row = document.createElement("div");
      row.className = "wib-virtual-list__row";
      row.style.height = `${itemHeight}px`;
      row.append(...renderScope.run(() => normalizeNodes(props.renderItem(item, index))));
      windowEl.append(row);
    }
  });

  return root;
};

/** ARIA live toast region for app-level notifications. */
export const ToastRegion: Component<ToastRegionProps> = (props) => {
  const region = document.createElement("div");
  region.className = "wib-toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");

  effect(() => {
    region.replaceChildren();
    for (const toast of read(props.toasts)) {
      const item = document.createElement("section");
      item.className = classes("wib-toast", `wib-toast--${read(toast.tone ?? "neutral")}`);
      item.dataset.toastId = toast.id;

      const title = document.createElement("strong");
      title.className = "wib-toast__title";
      title.textContent = read(toast.title ?? "");
      const message = document.createElement("p");
      message.className = "wib-toast__message";
      message.textContent = read(toast.message);
      item.append(title, message);

      if (toast.onAction && toast.actionLabel) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wib-button wib-button--neutral wib-button--small";
        button.textContent = read(toast.actionLabel);
        button.addEventListener("click", toast.onAction);
        item.append(button);
      }

      if (toast.onDismiss) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wib-button wib-button--neutral wib-button--small";
        button.textContent = "Dismiss";
        button.addEventListener("click", toast.onDismiss);
        item.append(button);
      }

      region.append(item);
    }
  });

  return region;
};

/** Determinate progress bar with native progress semantics. */
export const ProgressBar: Component<ProgressBarProps> = (props) => {
  const wrapper = document.createElement("div");
  wrapper.className = "wib-progress";
  const label = document.createElement("span");
  label.className = "wib-progress__label";
  label.append(createText(() => read(props.label ?? "")));
  const progress = document.createElement("progress");
  progress.className = "wib-progress__bar";
  effect(() => {
    progress.max = read(props.max ?? 100);
    progress.value = read(props.value);
  });
  wrapper.append(label, progress);
  return wrapper;
};

function bindTextControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  props: Pick<TextInputProps, "field" | "value" | "onChange">
): void {
  if (props.field) {
    onScopeDispose(bindInput(element, props.field));
  } else {
    effect(() => {
      const next = read(props.value ?? "");
      if (element.value !== next) {
        element.value = next;
      }
    });
  }

  const onInput = () => props.onChange?.(element.value);
  element.addEventListener("input", onInput);
  onScopeDispose(() => element.removeEventListener("input", onInput));
}

function classes(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function cssAlign(value: "start" | "center" | "end"): string {
  return value === "start" ? "left" : value === "end" ? "right" : "center";
}

function appendCell(target: HTMLElement, content: MaybeReadable<unknown> | Node | Node[]): void {
  if (content instanceof Node || Array.isArray(content)) {
    target.append(...normalizeNodes(content));
    return;
  }

  target.textContent = String(read(content) ?? "");
}
