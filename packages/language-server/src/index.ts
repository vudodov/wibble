import { formatWib, parseWib, validateWib, type Diagnostic } from "@wibble/compiler";

export interface CompletionItem {
  readonly label: string;
  readonly detail: string;
  readonly insertText: string;
}

export interface HoverInfo {
  readonly contents: string;
}

export interface DocumentSymbol {
  readonly name: string;
  readonly kind: "component" | "store" | "section" | "resource" | "action" | "state" | "derived" | "prop";
  readonly line: number;
}

export interface DefinitionInfo {
  readonly name: string;
  readonly line: number;
  readonly kind: DocumentSymbol["kind"];
}

const sectionCompletions: CompletionItem[] = [
  { label: "props", detail: "Declare immutable component props.", insertText: "props\n  name: string" },
  { label: "state", detail: "Declare local mutable signal state.", insertText: "state\n  count: number = 0" },
  { label: "derived", detail: "Declare pure computed values.", insertText: "derived\n  doubled: number = count * 2" },
  { label: "resource", detail: "Declare browser-side async data.", insertText: "resource name\n  key: [\"name\"]\n  load: fetcher(abortSignal)" },
  { label: "actions", detail: "Declare mutation and event entry points.", insertText: "actions\n  submit()\n    state = next" },
  { label: "view", detail: "Declare DOM/component output.", insertText: "view\n  section\n    text \"Hello\"" },
  { label: "if", detail: "Render a scoped conditional branch.", insertText: "if condition\n  p text \"Ready\"\nelse\n  p text \"Waiting\"" },
  { label: "for", detail: "Render a keyed list.", insertText: "for item in items key item.id\n  p text \"{item.name}\"" },
  { label: "slot", detail: "Render or provide a named slot.", insertText: "slot actions\n  button text \"Action\"" },
  { label: "bind value", detail: "Bind an input, textarea, or select to a Wibble field.", insertText: "bind value field" },
  { label: "bind checked", detail: "Bind an input checkbox to a Wibble boolean field.", insertText: "bind checked field" },
  { label: "bind group", detail: "Bind a radio input to a Wibble string field.", insertText: "bind group field" },
  { label: "bind files", detail: "Bind a file input to a Wibble File[] field.", insertText: "bind files field" },
  { label: "ref", detail: "Attach an element to a Wibble Ref for explicit DOM escape hatches.", insertText: "ref elementRef" }
];

/** Returns compiler diagnostics for a .wib document. */
export function getDiagnostics(source: string, filename?: string): Diagnostic[] {
  const parsed = parseWib(source, filename);
  return parsed.ast ? [...parsed.diagnostics, ...validateWib(parsed.ast)] : parsed.diagnostics;
}

/** Returns section-aware completions for .wib files. */
export function getCompletions(): CompletionItem[] {
  return sectionCompletions;
}

/** Returns hover documentation for known Wibble keywords. */
export function getHover(word: string): HoverInfo | undefined {
  const docs: Record<string, string> = {
    props: "Props are immutable inputs. They can be read in derived values, resources, actions, and view bindings.",
    state: "State declares local writable signals. State may only be assigned inside actions.",
    derived: "Derived values are pure computed signals. They should be synchronous and side-effect free.",
    resource: "Resources are the only declarative API read location. They expose data, error, status, loading, and refreshing.",
    actions: "Actions are the only mutation and imperative workflow entry points.",
    view: "The view section describes DOM, components, conditionals, keyed lists, slots, and bindings.",
    slot: "A slot renders named caller-provided content, falling back to nested content.",
    if: "An if block conditionally renders and disposes branch scopes.",
    for: "A for block renders keyed repeated content with stable identity.",
    bind: "Form bindings connect DOM inputs, selects, checkboxes, radio groups, and file inputs to @wibble/forms fields.",
    ref: "Refs attach a concrete DOM element to a Ref created with @wibble/core createRef(). They are intended for focus, measuring, and integration escape hatches."
  };

  return docs[word] ? { contents: docs[word] } : undefined;
}

/** Formats a .wib document using the compiler formatter. */
export function formatDocument(source: string, filename?: string): string {
  return formatWib(source, filename).code;
}

/** Returns a stable outline for navigation and review tools. */
export function getDocumentSymbols(source: string, filename?: string): DocumentSymbol[] {
  const parsed = parseWib(source, filename);
  if (!parsed.ast) {
    return [];
  }

  const symbols: DocumentSymbol[] = [{
    name: parsed.ast.name,
    kind: parsed.ast.kind,
    line: 1
  }];

  for (const section of parsed.ast.sections) {
    symbols.push({
      name: section.name ? `${section.kind} ${section.name}` : section.kind,
      kind: section.kind === "resource" ? "resource" : "section",
      line: section.line
    });

    for (const line of section.lines) {
      const declaration = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line.text.trim());
      if (declaration && (section.kind === "props" || section.kind === "state" || section.kind === "derived")) {
        symbols.push({
          name: declaration[1] ?? "",
          kind: section.kind === "props" ? "prop" : section.kind,
          line: line.line
        });
      }

      const action = /^(async\s+)?([A-Za-z_][A-Za-z0-9_]*)\(/.exec(line.text.trim());
      if (action && section.kind === "actions") {
        symbols.push({
          name: action[2] ?? "",
          kind: "action",
          line: line.line
        });
      }
    }
  }

  return symbols;
}

/** Finds the local declaration for a symbol name. */
export function getDefinition(source: string, word: string, filename?: string): DefinitionInfo | undefined {
  return getDocumentSymbols(source, filename)
    .filter((symbol) => symbol.name === word || symbol.name.endsWith(` ${word}`))
    .map((symbol) => ({ name: symbol.name, line: symbol.line, kind: symbol.kind }))
    .at(0);
}
