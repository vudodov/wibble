import type { ActionBlock, Declaration, SourceLine, WibDocument, WibSection } from "./ast";
import {
  declarationNames,
  getSection,
  getSections,
  parseActions,
  parseDeclarations,
  parseResourceShape
} from "./inspect";
import { parseQuotedStringLiteral, transformExpression, type ExpressionReferences } from "./expression";
import { parseViewTree, type ViewNode } from "./view";

export interface EmitResult {
  readonly code: string;
  readonly map: null;
}

export interface DeclarationEmitResult {
  readonly code: string;
  readonly map: null;
}

interface References extends ExpressionReferences {
  readonly components: Set<string>;
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

function expressionText(expression: string, refs: References): string {
  const trimmed = expression.trim();
  const raw = parseQuotedStringLiteral(trimmed);
  if (raw !== undefined) {
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
  const raw = parseQuotedStringLiteral(trimmed);
  if (raw !== undefined) {
    return JSON.stringify(raw);
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

function emitEffects(section: WibSection | undefined, refs: References): string {
  const content = section?.lines.filter((line) => line.text.trim().length > 0) ?? [];
  if (content.length === 0) {
    return "";
  }

  const baseIndent = Math.min(...content.map((line) => line.indent));
  const effectRefs = withLocals(refs, ["onCleanup"]);
  const lines = content.map((line) => {
    const relativeIndent = " ".repeat(Math.max(0, line.indent - baseIndent));
    return `${relativeIndent}${bodyLineToTypeScript(line, effectRefs)}`;
  });

  return `effect((onCleanup) => {\n${indent(lines.join("\n"))}\n});`;
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
    const componentProps = node.classExpression
      ? [{ name: "class", value: node.classExpression }, ...node.props]
      : node.props;
    const props = componentProps
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

  if (node.classExpression) {
    lines.push(`bindAttr(${id}, "class", ${expressionValue(node.classExpression, refs)});`);
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
  const effects = getSection(ast, "effects");
  const imports = emitImports(ast);
  const resourceNames = new Set(resources.map((section) => section.name).filter((name): name is string => Boolean(name)));
  const refs: References = {
    props: new Set(declarationNames(props)),
    state: new Set(declarationNames(state)),
    derived: new Set(declarationNames(derived)),
    resources: resourceNames,
    components: imports.components
  };
  const tree = parseViewTree(getSection(ast, "view"), refs).tree;

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
  const effectCode = emitEffects(effects, refs);
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
    effectCode,
    viewCode
  ].filter(Boolean).join("\n\n");

  return [
    "import { bindAttr, bindRef, computed, conditional, createResource, createText, effect, keyedEach, listen, normalizeNodes, onScopeDispose, read, renderComponent, renderSlot, signal, type Component, type MaybeReadable, type WibbleSlots } from \"@wibble/core\";",
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
  const effects = getSection(ast, "effects");
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
  const effectCode = emitEffects(effects, refs);
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
    effectCode,
    `return { ${returned.join(", ")} };`
  ].filter(Boolean).join("\n\n");

  return [
    "import { computed, createResource, effect, signal } from \"@wibble/core\";",
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
