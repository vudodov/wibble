import type { ActionBlock, Declaration, SourceLine, WibDocument, WibSection } from "./ast";
import {
  declarationNames,
  getSection,
  getSections,
  parseActions,
  parseDeclarations,
  parseResourceShape
} from "./inspect";

export interface EmitResult {
  readonly code: string;
  readonly map: null;
}

export interface DeclarationEmitResult {
  readonly code: string;
  readonly map: null;
}

interface References {
  readonly props: Set<string>;
  readonly state: Set<string>;
  readonly derived: Set<string>;
  readonly resources: Set<string>;
  readonly components: Set<string>;
  readonly locals?: Set<string>;
}

type ViewNodeKind = "root" | "element" | "component" | "text" | "if" | "for" | "slot";

interface ViewBranch {
  condition?: string;
  children: ViewNode[];
}

interface ViewBinding {
  readonly property: "value" | "checked" | "group" | "files";
  readonly field: string;
}

interface ViewNode {
  kind: ViewNodeKind;
  tag?: string;
  text?: string;
  eventName?: string;
  eventExpression?: string;
  className?: string;
  refName?: string;
  props: Array<{ name: string; value: string }>;
  attrs: Array<{ name: string; value: string }>;
  bindings: ViewBinding[];
  children: ViewNode[];
  branches: ViewBranch[];
  itemName?: string;
  itemsExpression?: string;
  keyExpression?: string;
  slotName?: string;
}

function createViewNode(kind: ViewNodeKind, values: Partial<ViewNode> = {}): ViewNode {
  return {
    kind,
    props: [],
    attrs: [],
    bindings: [],
    children: [],
    branches: [],
    ...values
  };
}

function indent(code: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join("\n");
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function lowerFirst(name: string): string {
  return `${name.slice(0, 1).toLowerCase()}${name.slice(1)}`;
}

function declarationType(declaration: Declaration): string {
  return declaration.type.trim() || "unknown";
}

function propType(declaration: Declaration): string {
  const optional = declaration.expression ? "?" : "";
  return `  ${declaration.name}${optional}: MaybeReadable<${declarationType(declaration)}>;`;
}

function emitPropsType(name: string, props: readonly Declaration[]): string {
  const lines = props.map(propType);
  lines.push("  slots?: WibbleSlots;");
  return `export interface ${name}Props {\n${lines.join("\n")}\n}`;
}

function replaceResourceReads(expression: string, resources: Set<string>): string {
  let output = expression;
  for (const resource of resources) {
    output = output
      .replace(new RegExp(`\\b${resource}\\.data\\b`, "g"), `${resource}.data.get()`)
      .replace(new RegExp(`\\b${resource}\\.error\\b`, "g"), `${resource}.error.get()`)
      .replace(new RegExp(`\\b${resource}\\.status\\b`, "g"), `${resource}.status.get()`)
      .replace(new RegExp(`\\b${resource}\\.loading\\b`, "g"), `${resource}.loading.get()`)
      .replace(new RegExp(`\\b${resource}\\.refreshing\\b`, "g"), `${resource}.refreshing.get()`);
  }
  return output;
}

function transformExpression(expression: string, refs: References): string {
  const locals = refs.locals ?? new Set<string>();
  const withResources = replaceResourceReads(expression, refs.resources);

  return withResources.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (identifier, offset, source) => {
    const previous = source[offset - 1];
    if (previous === "." || locals.has(identifier)) {
      return identifier;
    }

    if (refs.props.has(identifier)) {
      return `read(__props.${identifier})`;
    }

    if (refs.state.has(identifier) || refs.derived.has(identifier)) {
      return `${identifier}.get()`;
    }

    return identifier;
  });
}

function expressionText(expression: string, refs: References): string {
  const trimmed = expression.trim();
  if (/^".*"$/.test(trimmed)) {
    const raw = trimmed.slice(1, -1);
    if (!raw.includes("{")) {
      return `() => ${JSON.stringify(raw)}`;
    }

    const template = raw
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")
      .replace(/\{([^}]+)\}/g, (_, body: string) => `\${${transformExpression(body, refs)}}`);

    return `() => \`${template}\``;
  }

  return `() => String(${transformExpression(trimmed, refs)})`;
}

function expressionValue(expression: string, refs: References): string {
  const trimmed = expression.trim();
  if (/^".*"$/.test(trimmed)) {
    return JSON.stringify(trimmed.slice(1, -1));
  }

  return `() => ${transformExpression(trimmed, refs)}`;
}

function lineBody(line: SourceLine): string {
  return line.text.trim();
}

function bodyLineToTypeScript(line: SourceLine, refs: References): string {
  const body = lineBody(line);
  const invalidate = /^invalidate\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(body);
  if (invalidate) {
    return `await ${invalidate[1]}.invalidate();`;
  }

  const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(body);
  if (assignment && refs.state.has(assignment[1] ?? "")) {
    const target = assignment[1] ?? "";
    const value = transformExpression(assignment[2] ?? "undefined", refs);
    return `${target}.set(${value});`;
  }

  const transformed = transformExpression(body, refs);
  return /[;{}]$/.test(transformed) ? transformed : `${transformed};`;
}

function actionParamNames(params: string): Set<string> {
  return new Set(
    params
      .split(",")
      .map((param) => param.trim().split(":")[0]?.trim())
      .filter((param): param is string => Boolean(param))
  );
}

function emitActions(actions: readonly ActionBlock[], refs: References): string {
  return actions
    .map((action) => {
      const locals = new Set([...(refs.locals ?? []), ...actionParamNames(action.params)]);
      const actionRefs = { ...refs, locals };
      const lines = action.lines.length > 0
        ? action.lines.map((line) => indent(bodyLineToTypeScript(line, actionRefs), 2)).join("\n")
        : "  // Empty action generated from .wib source.";

      return `${action.async ? "async " : ""}function ${action.name}(${action.params}) {\n${lines}\n}`;
    })
    .join("\n\n");
}

function readToken(source: string, start: number): { value: string; end: number } | undefined {
  let index = start;
  while (source[index] === " ") {
    index += 1;
  }

  if (index >= source.length) {
    return undefined;
  }

  if (source[index] === "\"") {
    let end = index + 1;
    while (end < source.length && source[end] !== "\"") {
      end += 1;
    }
    return {
      value: source.slice(index, Math.min(end + 1, source.length)),
      end: Math.min(end + 1, source.length)
    };
  }

  const match = /^[^\s]+/.exec(source.slice(index));
  if (!match) {
    return undefined;
  }

  return {
    value: match[0],
    end: index + match[0].length
  };
}

function parsePairs(source: string): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  let index = 0;

  while (index < source.length) {
    const name = readToken(source, index);
    if (!name) {
      break;
    }

    const value = readToken(source, name.end);
    if (!value) {
      break;
    }

    pairs.push({ name: name.value, value: value.value });
    index = value.end;
  }

  return pairs;
}

function stripDirective(source: string, pattern: RegExp): string {
  return source.replace(pattern, "").replace(/\s+/g, " ").trim();
}

function parseViewLine(text: string, refs: References): ViewNode | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.startsWith("text ")) {
    return createViewNode("text", {
      text: trimmed.slice(5).trim()
    });
  }

  const forMatch = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+?)\s+key\s+(.+)$/.exec(trimmed);
  if (forMatch) {
    return createViewNode("for", {
      itemName: forMatch[1],
      itemsExpression: forMatch[2]?.trim(),
      keyExpression: forMatch[3]?.trim()
    });
  }

  if (trimmed.startsWith("if ")) {
    return createViewNode("if", {
      branches: [{
        condition: trimmed.slice(3).trim(),
        children: []
      }]
    });
  }

  const slot = /^slot\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
  if (slot) {
    return createViewNode("slot", {
      slotName: slot[1]
    });
  }

  const tag = /^[A-Za-z][A-Za-z0-9-]*/.exec(trimmed)?.[0];
  if (!tag) {
    return undefined;
  }

  const rest = trimmed.slice(tag.length).trim();
  const textMatch = /\btext\s+(.+)$/.exec(rest);
  const restWithoutText = textMatch ? rest.slice(0, textMatch.index).trim() : rest;
  const event = /\bon\s+([A-Za-z]+)\s*->\s*(.+?)(?=\s+(?:class\s+"|bind\s+|[A-Za-z][A-Za-z0-9-]*\s)|$)/.exec(restWithoutText);
  const className = /\bclass\s+"([^"]+)"/.exec(restWithoutText)?.[1];
  const refName = /\bref\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(restWithoutText)?.[1];
  const bindings = [...restWithoutText.matchAll(/\bbind\s+(value|checked|group|files)\s+([A-Za-z_][A-Za-z0-9_.]*)/g)]
    .map((match) => ({ property: match[1] as "value" | "checked" | "group" | "files", field: match[2] ?? "" }));
  const isComponent = refs.components.has(tag);

  const attrSource = [
    [/\bclass\s+"[^"]+"/g],
    [/\bon\s+[A-Za-z]+\s*->\s*.+?(?=\s+(?:class\s+"|bind\s+|[A-Za-z][A-Za-z0-9-]*\s)|$)/g],
    [/\bref\s+[A-Za-z_][A-Za-z0-9_]*/g],
    [/\bbind\s+(value|checked|group|files)\s+[A-Za-z_][A-Za-z0-9_.]*/g]
  ].reduce((source, [pattern]) => stripDirective(source, pattern), restWithoutText);

  if (isComponent) {
    return createViewNode("component", {
      tag,
      props: parsePairs(attrSource)
    });
  }

  return createViewNode("element", {
    tag,
    text: textMatch?.[1]?.trim(),
    eventName: event?.[1],
    eventExpression: event?.[2]?.trim(),
    className,
    refName,
    attrs: parsePairs(attrSource),
    bindings
  });
}

function childTarget(node: ViewNode): ViewNode[] {
  if (node.kind === "if") {
    const branch = node.branches[node.branches.length - 1];
    return branch?.children ?? node.children;
  }

  return node.children;
}

function parseViewTree(section: WibSection | undefined, refs: References): ViewNode {
  const root = createViewNode("root");
  if (!section) {
    return root;
  }

  const content = section.lines.filter((line) => line.text.trim().length > 0);
  const baseIndent = content.length > 0 ? Math.min(...content.map((line) => line.indent)) : 2;
  const stack: Array<{ indent: number; node: ViewNode }> = [{ indent: -1, node: root }];

  for (const line of content) {
    const currentIndent = line.indent - baseIndent;
    while ((stack.at(-1)?.indent ?? -1) >= currentIndent) {
      stack.pop();
    }

    const trimmed = line.text.trim();
    if (trimmed === "else" || trimmed.startsWith("else if ")) {
      const parent = stack.at(-1)?.node;
      const previous = parent ? childTarget(parent).at(-1) : undefined;
      if (previous?.kind !== "if") {
        continue;
      }

      previous.branches.push({
        condition: trimmed.startsWith("else if ") ? trimmed.slice(8).trim() : undefined,
        children: []
      });
      stack.push({ indent: currentIndent, node: previous });
      continue;
    }

    const node = parseViewLine(line.text, refs);
    if (!node) {
      continue;
    }

    stack.at(-1) && childTarget(stack.at(-1)!.node).push(node);
    if (["element", "component", "if", "for", "slot"].includes(node.kind)) {
      stack.push({ indent: currentIndent, node });
    }
  }

  return root;
}

function withLocals(refs: References, names: readonly string[]): References {
  return {
    ...refs,
    locals: new Set([...(refs.locals ?? []), ...names])
  };
}

function emitFragmentBody(children: readonly ViewNode[], refs: References, nextId: () => string): string[] {
  return [
    "const fragment = document.createDocumentFragment();",
    ...children.flatMap((child) => emitViewNode(child, "fragment", refs, nextId)),
    "return Array.from(fragment.childNodes);"
  ];
}

function emitFunctionBody(children: readonly ViewNode[], refs: References, nextId: () => string): string {
  return `() => {\n${indent(emitFragmentBody(children, refs, nextId).join("\n"))}\n}`;
}

function emitEventCall(expression: string | undefined, refs: References): string | undefined {
  if (!expression) {
    return undefined;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expression)) {
    return `${expression}()`;
  }

  return transformExpression(expression, refs);
}

function appendNormalized(parent: string, expression: string): string[] {
  return [
    `for (const child of normalizeNodes(${expression})) {`,
    `  ${parent}.append(child);`,
    "}"
  ];
}

function emitComponentSlots(node: ViewNode, refs: References, nextId: () => string): string | undefined {
  const namedSlots = new Map<string, ViewNode[]>();
  const defaultChildren: ViewNode[] = [];

  for (const child of node.children) {
    if (child.kind === "slot") {
      namedSlots.set(child.slotName ?? "default", child.children);
    } else {
      defaultChildren.push(child);
    }
  }

  if (defaultChildren.length > 0) {
    namedSlots.set("default", defaultChildren);
  }

  if (namedSlots.size === 0) {
    return undefined;
  }

  const entries = [...namedSlots.entries()].map(([name, children]) => {
    return `${JSON.stringify(name)}: ${emitFunctionBody(children, refs, nextId)}`;
  });

  return `{\n${indent(entries.join(",\n"))}\n}`;
}

function emitViewNode(node: ViewNode, parent: string, refs: References, nextId: () => string): string[] {
  if (node.kind === "text") {
    return [`${parent}.append(createText(${expressionText(node.text ?? "\"\"", refs)}));`];
  }

  if (node.kind === "root") {
    return node.children.flatMap((child) => emitViewNode(child, parent, refs, nextId));
  }

  if (node.kind === "slot") {
    return appendNormalized(parent, `renderSlot(__props.slots, ${JSON.stringify(node.slotName ?? "default")}, ${emitFunctionBody(node.children, refs, nextId)})`);
  }

  if (node.kind === "if") {
    const body: string[] = [
      "const fragment = document.createDocumentFragment();"
    ];

    node.branches.forEach((branch, index) => {
      const prefix = index === 0 ? "if" : branch.condition ? "else if" : "else";
      if (branch.condition) {
        body.push(`${prefix} (${transformExpression(branch.condition, refs)}) {`);
      } else {
        body.push(`${prefix} {`);
      }
      body.push(indent(branch.children.flatMap((child) => emitViewNode(child, "fragment", refs, nextId)).join("\n")));
      body.push("}");
    });

    body.push("return Array.from(fragment.childNodes);");
    return [
      `conditional(${parent}, () => {`,
      indent(body.join("\n")),
      "});"
    ];
  }

  if (node.kind === "for") {
    const itemName = node.itemName ?? "item";
    const localRefs = withLocals(refs, [itemName]);
    return [
      `keyedEach(${parent}, () => ${transformExpression(node.itemsExpression ?? "[]", refs)}, (${itemName}) => ${transformExpression(node.keyExpression ?? itemName, localRefs)}, (${itemName}) => {`,
      indent(emitFragmentBody(node.children, localRefs, nextId).join("\n")),
      "});"
    ];
  }

  if (node.kind === "component") {
    const props = node.props
      .map((prop) => `${prop.name}: ${expressionValue(prop.value, refs)}`)
      .join(", ");
    const slots = emitComponentSlots(node, refs, nextId);
    const propsObject = slots
      ? `{ ${props}${props ? ", " : ""}slots: ${slots} }`
      : `{ ${props} }`;
    return appendNormalized(parent, `renderComponent(${node.tag}, ${propsObject})`);
  }

  const id = nextId();
  const lines = [`const ${id} = document.createElement(${JSON.stringify(node.tag)});`];

  if (node.className) {
    lines.push(`bindAttr(${id}, "class", ${JSON.stringify(node.className)});`);
  }

  if (node.refName) {
    lines.push(`bindRef(${transformExpression(node.refName, refs)}, ${id});`);
  }

  if (node.eventName) {
    const eventCall = emitEventCall(node.eventExpression, refs);
    if (eventCall) {
      lines.push(`listen(${id}, ${JSON.stringify(node.eventName)}, () => { void ${eventCall}; });`);
    }
  }

  for (const attr of node.attrs) {
    lines.push(`bindAttr(${id}, ${JSON.stringify(attr.name)}, ${expressionValue(attr.value, refs)});`);
  }

  for (const binding of node.bindings) {
    const helper = {
      checked: "bindCheckbox",
      files: "bindFiles",
      group: "bindRadioGroup",
      value: "bindInput"
    }[binding.property];
    const elementType = {
      checked: "HTMLInputElement",
      files: "HTMLInputElement",
      group: "HTMLInputElement",
      value: "HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement"
    }[binding.property];
    lines.push(`onScopeDispose(${helper}(${id} as ${elementType}, ${transformExpression(binding.field, refs)}));`);
  }

  if (node.text) {
    lines.push(`${id}.append(createText(${expressionText(node.text, refs)}));`);
  }

  for (const child of node.children) {
    lines.push(...emitViewNode(child, id, refs, nextId));
  }

  lines.push(`${parent}.append(${id});`);
  return lines;
}

function treeUsesFormBindings(node: ViewNode): boolean {
  if (node.bindings.length > 0) {
    return true;
  }

  return [
    ...node.children,
    ...node.branches.flatMap((branch) => branch.children)
  ].some(treeUsesFormBindings);
}

function emitView(tree: ViewNode, refs: References): string {
  let counter = 0;
  const nextId = () => `node${counter++}`;
  const lines = [
    "const fragment = document.createDocumentFragment();",
    ...emitViewNode(tree, "fragment", refs, nextId),
    "return Array.from(fragment.childNodes);"
  ];

  return lines.join("\n");
}

function emitImports(ast: WibDocument): { code: string; components: Set<string> } {
  const imports: string[] = [];
  const components = new Set<string>();

  for (const section of getSections(ast, "use")) {
    for (const line of section.lines) {
      const raw = line.text.trim();
      if (!raw.startsWith("import ")) {
        continue;
      }

      imports.push(`${raw};`);
      const defaultImport = /^import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+/.exec(raw);
      if (defaultImport) {
        components.add(defaultImport[1] ?? "");
      }

      if (!raw.startsWith("import type")) {
        const namedImport = /^import\s+\{([^}]+)\}\s+from\s+/.exec(raw);
        if (namedImport) {
          for (const part of (namedImport[1] ?? "").split(",")) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name && /^[A-Z]/.test(name)) {
              components.add(name);
            }
          }
        }
      }
    }
  }

  return {
    code: imports.join("\n"),
    components
  };
}

function resourceOption(section: WibSection, key: string): string | undefined {
  const prefix = `${key}:`;
  return section.lines.find((line) => line.text.trim().startsWith(prefix))?.text.trim().slice(prefix.length).trim();
}

function emitResources(sections: readonly WibSection[], refs: References): string {
  return sections
    .map((section) => {
      const shape = parseResourceShape(section);
      const key = shape.key?.text.trim().slice(4).trim() ?? JSON.stringify(section.name ?? "resource");
      const load = shape.load?.text.trim().slice(5).trim() ?? "Promise.resolve(undefined)";
      const name = section.name ?? "resource";
      const staleTime = resourceOption(section, "staleTime");
      const retry = resourceOption(section, "retry");
      const refetchOnWindowFocus = resourceOption(section, "refetchOnWindowFocus");
      const options = [
        `key: () => ${transformExpression(key, refs)}`,
        `load: ({ signal: abortSignal }) => ${transformExpression(load, { ...refs, locals: new Set([...(refs.locals ?? []), "abortSignal"]) })}`,
        staleTime ? `staleTime: ${transformExpression(staleTime, refs)}` : undefined,
        retry ? `retry: ${transformExpression(retry, refs)}` : undefined,
        refetchOnWindowFocus ? `refetchOnWindowFocus: ${transformExpression(refetchOnWindowFocus, refs)}` : undefined
      ].filter(Boolean);

      return `const ${name} = createResource({\n${indent(options.join(",\n"))}\n});`;
    })
    .join("\n\n");
}

function emitComponent(ast: WibDocument): string {
  const props = parseDeclarations(getSection(ast, "props"));
  const state = parseDeclarations(getSection(ast, "state"));
  const derived = parseDeclarations(getSection(ast, "derived"));
  const resources = getSections(ast, "resource");
  const actions = parseActions(getSection(ast, "actions"));
  const imports = emitImports(ast);
  const resourceNames = new Set(resources.map((section) => section.name).filter((name): name is string => Boolean(name)));
  const refs: References = {
    props: new Set(declarationNames(props)),
    state: new Set(declarationNames(state)),
    derived: new Set(declarationNames(derived)),
    resources: resourceNames,
    components: imports.components
  };
  const tree = parseViewTree(getSection(ast, "view"), refs);

  const propsType = emitPropsType(ast.name, props);
  const defaults = props.filter((prop) => prop.expression);
  const propsInit = defaults.length > 0
    ? `const __props = { ${defaults.map((prop) => `${prop.name}: ${prop.expression}`).join(", ")}, ...props } as Required<${ast.name}Props> & ${ast.name}Props;`
    : "const __props = props;";

  const stateCode = state
    .map((declaration) => `const ${declaration.name} = signal<${declarationType(declaration)}>(${transformExpression(declaration.expression ?? "undefined", refs)});`)
    .join("\n");

  const resourceCode = emitResources(resources, refs);

  const derivedCode = derived
    .map((declaration) => `const ${declaration.name} = computed<${declarationType(declaration)}>(() => ${transformExpression(declaration.expression ?? "undefined", refs)});`)
    .join("\n");

  const actionCode = emitActions(actions, refs);
  const viewCode = emitView(tree, refs);
  const formImport = treeUsesFormBindings(tree)
    ? "import { bindCheckbox, bindFiles, bindInput, bindRadioGroup } from \"@wibble/forms\";"
    : "";

  const body = [
    propsInit,
    stateCode,
    resourceCode,
    derivedCode,
    actionCode,
    viewCode
  ].filter(Boolean).join("\n\n");

  return [
    "import { bindAttr, bindRef, computed, conditional, createResource, createText, keyedEach, listen, normalizeNodes, onScopeDispose, read, renderComponent, renderSlot, signal, type Component, type MaybeReadable, type WibbleSlots } from \"@wibble/core\";",
    formImport,
    imports.code,
    "",
    propsType,
    "",
    `export const ${ast.name}: Component<${ast.name}Props> = (props) => {`,
    indent(body),
    "};",
    "",
    `export default ${ast.name};`,
    ""
  ].filter((line) => line !== undefined).join("\n");
}

function emitStore(ast: WibDocument): string {
  const state = parseDeclarations(getSection(ast, "state"));
  const derived = parseDeclarations(getSection(ast, "derived"));
  const resources = getSections(ast, "resource");
  const actions = parseActions(getSection(ast, "actions"));
  const imports = emitImports(ast);
  const safeName = sanitizeName(ast.name);
  const instanceName = lowerFirst(safeName);
  const resourceNames = new Set(resources.map((section) => section.name).filter((name): name is string => Boolean(name)));
  const refs: References = {
    props: new Set(),
    state: new Set(declarationNames(state)),
    derived: new Set(declarationNames(derived)),
    resources: resourceNames,
    components: new Set()
  };

  const stateCode = state
    .map((declaration) => `const ${declaration.name} = signal<${declarationType(declaration)}>(${transformExpression(declaration.expression ?? "undefined", refs)});`)
    .join("\n");
  const resourceCode = emitResources(resources, refs);
  const derivedCode = derived
    .map((declaration) => `const ${declaration.name} = computed<${declarationType(declaration)}>(() => ${transformExpression(declaration.expression ?? "undefined", refs)});`)
    .join("\n");
  const actionCode = emitActions(actions, refs);
  const returned = [
    ...declarationNames(state),
    ...resources.map((section) => section.name).filter((name): name is string => Boolean(name)),
    ...declarationNames(derived),
    ...actions.map((action) => action.name)
  ];

  const body = [
    stateCode,
    resourceCode,
    derivedCode,
    actionCode,
    `return { ${returned.join(", ")} };`
  ].filter(Boolean).join("\n\n");

  return [
    "import { computed, createResource, signal } from \"@wibble/core\";",
    "import { defineStore } from \"@wibble/store\";",
    imports.code,
    "",
    `export function create${safeName}() {`,
    indent(body),
    "}",
    "",
    `export const ${ast.name} = defineStore(${JSON.stringify(ast.name)}, create${safeName});`,
    `export const ${instanceName} = ${ast.name}.create();`,
    ""
  ].join("\n");
}

function emitComponentDeclarations(ast: WibDocument): string {
  const props = parseDeclarations(getSection(ast, "props"));
  return [
    "import type { Component, MaybeReadable, WibbleSlots } from \"@wibble/core\";",
    "",
    emitPropsType(ast.name, props),
    "",
    `export declare const ${ast.name}: Component<${ast.name}Props>;`,
    `export default ${ast.name};`,
    ""
  ].join("\n");
}

function emitActionSignature(action: ActionBlock): string {
  const returnType = action.async ? "Promise<unknown>" : "void";
  return `  ${action.name}(${action.params}): ${returnType};`;
}

function emitStoreDeclarations(ast: WibDocument): string {
  const state = parseDeclarations(getSection(ast, "state"));
  const derived = parseDeclarations(getSection(ast, "derived"));
  const resources = getSections(ast, "resource");
  const actions = parseActions(getSection(ast, "actions"));
  const safeName = sanitizeName(ast.name);
  const instanceName = lowerFirst(safeName);
  const storeShape = `${safeName}Instance`;
  const stateLines = state.map((declaration) => `  readonly ${declaration.name}: WritableSignal<${declarationType(declaration)}>;`);
  const resourceLines = resources
    .map((section) => `  readonly ${section.name}: Resource<unknown>;`)
    .filter((line) => !line.includes("undefined"));
  const derivedLines = derived.map((declaration) => `  readonly ${declaration.name}: Readable<${declarationType(declaration)}>;`);
  const actionLines = actions.map(emitActionSignature);

  return [
    "import type { Readable, Resource, WritableSignal } from \"@wibble/core\";",
    "import type { StoreDefinition } from \"@wibble/store\";",
    "",
    `export interface ${storeShape} {`,
    [...stateLines, ...resourceLines, ...derivedLines, ...actionLines].join("\n"),
    "}",
    "",
    `export declare function create${safeName}(): ${storeShape};`,
    `export declare const ${ast.name}: StoreDefinition<${storeShape}>;`,
    `export declare const ${instanceName}: ${storeShape};`,
    ""
  ].join("\n");
}

export function emitTypeScript(ast: WibDocument): EmitResult {
  return {
    code: ast.kind === "component" ? emitComponent(ast) : emitStore(ast),
    map: null
  };
}

export function emitDeclarations(ast: WibDocument): DeclarationEmitResult {
  return {
    code: ast.kind === "component" ? emitComponentDeclarations(ast) : emitStoreDeclarations(ast),
    map: null
  };
}
