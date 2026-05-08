import { computed, signal, type Readable, type WritableSignal } from "@wibble/core";

export type Validator<T> = (value: T) => string | undefined;
export type SubmitHandler<TFields extends Record<string, Field<unknown>>> = (
  values: FormValues<TFields>
) => void | Promise<void>;

export type FormValues<TFields extends Record<string, Field<unknown>>> = {
  readonly [K in keyof TFields]: TFields[K] extends Field<infer TValue> ? TValue : never;
};

export interface Field<T> {
  /** Current field value. */
  readonly value: WritableSignal<T>;
  /** Whether the user has changed the field from its initial value. */
  readonly dirty: Readable<boolean>;
  /** Whether the field has been blurred or explicitly marked touched. */
  readonly touched: WritableSignal<boolean>;
  /** Current validation error, if any. */
  readonly error: Readable<string | undefined>;
  /** All current validation errors. */
  readonly errors: Readable<string[]>;
  /** Sets the field value. */
  set(value: T): void;
  /** Marks the field as touched. */
  touch(): void;
  /** Resets value, dirty state, and touched state. */
  reset(value?: T): void;
}

export interface Form<TFields extends Record<string, Field<unknown>>> {
  /** Field map keyed by field name. */
  readonly fields: TFields;
  /** True when any field is dirty. */
  readonly dirty: Readable<boolean>;
  /** True when every field is valid. */
  readonly valid: Readable<boolean>;
  /** True while a submit action is running. */
  readonly submitting: Readable<boolean>;
  /** Last submit-level error, if any. */
  readonly submitError: Readable<unknown>;
  /** Reads the current form values as a plain object. */
  values(): FormValues<TFields>;
  /** Marks every field as touched. */
  touchAll(): void;
  /** Resets every field to its initial value. */
  reset(): void;
  /** Touches every field, validates, and runs the submit handler if valid. */
  submit(handler: SubmitHandler<TFields>): Promise<boolean>;
}

export interface FieldArray<T> {
  /** Current array items. */
  readonly items: WritableSignal<T[]>;
  /** True when the array has changed from its initial value. */
  readonly dirty: Readable<boolean>;
  /** Appends one item. */
  append(item: T): void;
  /** Replaces one item by index. */
  update(index: number, item: T): void;
  /** Removes one item by index. */
  remove(index: number): void;
  /** Resets the array to its initial or provided items. */
  reset(items?: readonly T[]): void;
}

/** Creates a typed field with dirty/touched/error state. */
export function createField<T>(initial: T, validators: Validator<T>[] = []): Field<T> {
  const value = signal(initial);
  const initialValue = signal(initial);
  const touched = signal(false);
  const dirty = computed(() => !Object.is(value.get(), initialValue.get()));
  const errors = computed(() => validators.map((validator) => validator(value.get())).filter((error): error is string => Boolean(error)));
  const error = computed(() => errors.get()[0]);

  return {
    value,
    dirty,
    touched,
    error,
    errors,
    set(next) {
      value.set(next);
    },
    touch() {
      touched.set(true);
    },
    reset(next = initialValue.peek()) {
      initialValue.set(next);
      value.set(next);
      touched.set(false);
    }
  };
}

/** Creates a form from a map of fields. */
export function createForm<TFields extends Record<string, Field<unknown>>>(fields: TFields): Form<TFields> {
  const submitting = signal(false);
  const submitError = signal<unknown>(undefined);

  return {
    fields,
    dirty: computed(() => Object.values(fields).some((field) => field.dirty.get())),
    valid: computed(() => Object.values(fields).every((field) => !field.error.get())),
    submitting,
    submitError,
    values() {
      return Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [key, field.value.get()])
      ) as FormValues<TFields>;
    },
    touchAll() {
      for (const field of Object.values(fields)) {
        field.touch();
      }
    },
    reset() {
      for (const field of Object.values(fields)) {
        field.reset();
      }
      submitError.set(undefined);
    },
    async submit(handler) {
      this.touchAll();
      submitError.set(undefined);
      if (!this.valid.get()) {
        return false;
      }

      submitting.set(true);
      try {
        await handler(this.values());
        return true;
      } catch (error) {
        submitError.set(error);
        return false;
      } finally {
        submitting.set(false);
      }
    }
  };
}

/** Creates a field array for repeatable object sections. */
export function createFieldArray<T>(initial: readonly T[] = []): FieldArray<T> {
  const items = signal<T[]>([...initial]);
  const initialItems = signal<T[]>([...initial]);
  const dirty = computed(() => JSON.stringify(items.get()) !== JSON.stringify(initialItems.get()));

  return {
    items,
    dirty,
    append(item) {
      items.update((current) => [...current, item]);
    },
    update(index, item) {
      items.update((current) => current.map((currentItem, currentIndex) => currentIndex === index ? item : currentItem));
    },
    remove(index) {
      items.update((current) => current.filter((_, currentIndex) => currentIndex !== index));
    },
    reset(next = initialItems.peek()) {
      initialItems.set([...next]);
      items.set([...next]);
    }
  };
}

/** Binds an input, textarea, or select element to a string field. */
export function bindInput(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  field: Field<string>
): () => void {
  const onInput = () => field.set(element.value);
  const onBlur = () => field.touch();
  element.value = field.value.peek();
  element.addEventListener("input", onInput);
  element.addEventListener("change", onInput);
  element.addEventListener("blur", onBlur);
  const stop = field.value.subscribe(() => {
    if (element.value !== field.value.peek()) {
      element.value = field.value.peek();
    }
  });

  return () => {
    stop();
    element.removeEventListener("input", onInput);
    element.removeEventListener("change", onInput);
    element.removeEventListener("blur", onBlur);
  };
}

/** Binds a checkbox to a boolean field. */
export function bindCheckbox(element: HTMLInputElement, field: Field<boolean>): () => void {
  const onChange = () => field.set(element.checked);
  const onBlur = () => field.touch();
  element.checked = field.value.peek();
  element.addEventListener("change", onChange);
  element.addEventListener("blur", onBlur);
  const stop = field.value.subscribe(() => {
    element.checked = field.value.peek();
  });

  return () => {
    stop();
    element.removeEventListener("change", onChange);
    element.removeEventListener("blur", onBlur);
  };
}

/** Binds a group of radio inputs to a string field. */
export function bindRadioGroup(element: HTMLInputElement, field: Field<string>): () => void {
  const onChange = () => {
    if (element.checked) {
      field.set(element.value);
    }
  };
  const onBlur = () => field.touch();
  element.checked = element.value === field.value.peek();
  element.addEventListener("change", onChange);
  element.addEventListener("blur", onBlur);
  const stop = field.value.subscribe(() => {
    element.checked = element.value === field.value.peek();
  });

  return () => {
    stop();
    element.removeEventListener("change", onChange);
    element.removeEventListener("blur", onBlur);
  };
}

/** Binds a file input to a File[] field. */
export function bindFiles(element: HTMLInputElement, field: Field<File[]>): () => void {
  const onChange = () => {
    field.set(Array.from(element.files ?? []));
    field.touch();
  };
  element.addEventListener("change", onChange);

  return () => {
    element.removeEventListener("change", onChange);
  };
}
