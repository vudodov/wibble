import type { SourceLine, WibSection } from "./ast";

export type ViewNodeKind = "root" | "element" | "component" | "text" | "if" | "for" | "slot";

export interface ViewDiagnostic {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface ViewBranch {
  readonly condition?: string;
  readonly children: ViewNode[];
}

export interface ViewBinding {
  readonly property: "value" | "checked" | "group" | "files";
  readonly field: string;
}

export interface ViewNode {
  readonly kind: ViewNodeKind;
  readonly line: number;
  readonly tag?: string;
  readonly text?: string;
  readonly eventName?: string;
  readonly eventExpression?: string;
  readonly classExpression?: string;
  readonly refName?: string;
  readonly props: Array<{ name: string; value: string }>;
  readonly attrs: Array<{ name: string; value: string }>;
  readonly bindings: ViewBinding[];
  readonly children: ViewNode[];
  readonly branches: ViewBranch[];
  readonly itemName?: string;
  readonly itemsExpression?: string;
  readonly keyExpression?: string;
  readonly slotName?: string;
}

export interface ViewReferences {
  readonly components: Set<string>;
}

export interface ViewParseResult {
  readonly tree: ViewNode;
  readonly diagnostics: ViewDiagnostic[];
}

interface Token {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

const matchingCloser: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}"
};

function createViewNode(kind: ViewNodeKind, values: Partial<ViewNode> = {}): ViewNode {
  return {
    kind,
    line: 1,
    props: [],
    attrs: [],
    bindings: [],
    children: [],
    branches: [],
    ...values
  };
}

function viewDiagnostic(
  code: string,
  message: string,
  line: SourceLine,
  column = 1,
  severity: ViewDiagnostic["severity"] = "error"
): ViewDiagnostic {
  return {
    code,
    severity,
    message,
    line: line.line,
    column
  };
}

function skipSpaces(source: string, start: number): number {
  let index = start;
  while (source[index] === " ") {
    index += 1;
  }
  return index;
}

function readQuotedToken(source: string, start: number, line: SourceLine, diagnostics: ViewDiagnostic[]): Token {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return {
        value: source.slice(start, index + 1),
        start,
        end: index + 1
      };
    }

    index += 1;
  }

  diagnostics.push(viewDiagnostic("WIB_VIEW_SYNTAX", "Unterminated string literal in view line.", line, start + 1));
  return {
    value: source.slice(start),
    start,
    end: source.length
  };
}

function readToken(source: string, start: number, line: SourceLine, diagnostics: ViewDiagnostic[]): Token | undefined {
  let index = skipSpaces(source, start);
  if (index >= source.length) {
    return undefined;
  }

  if (source[index] === "\"" || source[index] === "'") {
    return readQuotedToken(source, index, line, diagnostics);
  }

  const stack: string[] = [];
  const tokenStart = index;

  while (index < source.length) {
    const char = source[index] ?? "";
    const expectedCloser = stack.at(-1);

    if (!expectedCloser && /\s/.test(char)) {
      break;
    }

    if (char === "\"" || char === "'") {
      index = readQuotedToken(source, index, line, diagnostics).end;
      continue;
    }

    if (matchingCloser[char]) {
      stack.push(matchingCloser[char] ?? "");
      index += 1;
      continue;
    }

    if (expectedCloser && char === expectedCloser) {
      stack.pop();
      index += 1;
      continue;
    }

    index += 1;
  }

  if (stack.length > 0) {
    diagnostics.push(viewDiagnostic("WIB_VIEW_SYNTAX", "Unbalanced expression in view line.", line, tokenStart + 1));
  }

  return {
    value: source.slice(tokenStart, index),
    start: tokenStart,
    end: index
  };
}

function lineColumn(line: SourceLine, trimmedIndex: number): number {
  return line.text.indexOf(line.text.trim()) + trimmedIndex + 1;
}

function parseTagLine(line: SourceLine, refs: ViewReferences, diagnostics: ViewDiagnostic[]): ViewNode | undefined {
  const trimmed = line.text.trim();
  const tag = /^[A-Za-z][A-Za-z0-9-]*/.exec(trimmed)?.[0];
  if (!tag) {
    diagnostics.push(viewDiagnostic("WIB_VIEW_SYNTAX", "Expected a text node, control block, component, or HTML element.", line));
    return undefined;
  }

  let index = tag.length;
  let text: string | undefined;
  let eventName: string | undefined;
  let eventExpression: string | undefined;
  let classExpression: string | undefined;
  let refName: string | undefined;
  const pairs: Array<{ name: string; value: string }> = [];
  const bindings: ViewBinding[] = [];

  while (index < trimmed.length) {
    const token = readToken(trimmed, index, line, diagnostics);
    if (!token) {
      break;
    }

    index = token.end;

    if (token.value === "text") {
      text = trimmed.slice(token.end).trim();
      if (!text) {
        diagnostics.push(viewDiagnostic("WIB_VIEW_SYNTAX", "`text` needs a literal or expression.", line, lineColumn(line, token.start)));
      }
      break;
    }

    if (token.value === "class") {
      const value = readToken(trimmed, token.end, line, diagnostics);
      if (!value) {
        diagnostics.push(viewDiagnostic("WIB_VIEW_SYNTAX", "`class` needs a literal or expression.", line, lineColumn(line, token.start)));
        break;
      }
      classExpression = value.value;
      index = value.end;
      continue;
    }

    if (token.value === "ref") {
      const value = readToken(trimmed, token.end, line, diagnostics);
      if (!value) {
        diagnostics.push(viewDiagnostic("WIB_REF_NAME", "Refs must name a local Ref value, for example `div ref panelRef`.", line, lineColumn(line, token.start)));
        break;
      }
      refName = value.value;
      index = value.end;
      continue;
    }

    if (token.value === "bind") {
      const property = readToken(trimmed, token.end, line, diagnostics);
      const field = property ? readToken(trimmed, property.end, line, diagnostics) : undefined;
      if (!property || !field || !["value", "checked", "group", "files"].includes(property.value)) {
        diagnostics.push(viewDiagnostic(
          "WIB_FORM_BINDING",
          "Form bindings must use `bind value field`, `bind checked field`, `bind group field`, or `bind files field`.",
          line,
          lineColumn(line, token.start)
        ));
        break;
      }
      bindings.push({ property: property.value as ViewBinding["property"], field: field.value });
      index = field.end;
      continue;
    }

    if (token.value === "on") {
      const event = readToken(trimmed, token.end, line, diagnostics);
      const arrow = event ? readToken(trimmed, event.end, line, diagnostics) : undefined;
      if (!event || arrow?.value !== "->") {
        diagnostics.push(viewDiagnostic("WIB_VIEW_EVENT", "Events must use `on event -> actionOrExpression`.", line, lineColumn(line, token.start)));
        break;
      }
      eventName = event.value;
      eventExpression = trimmed.slice(arrow.end).trim();
      if (!eventExpression) {
        diagnostics.push(viewDiagnostic("WIB_VIEW_EVENT", "Events must call an action or expression after `->`.", line, lineColumn(line, arrow.start)));
      }
      break;
    }

    const value = readToken(trimmed, token.end, line, diagnostics);
    if (!value) {
      diagnostics.push(viewDiagnostic("WIB_VIEW_SYNTAX", `Attribute or prop \`${token.value}\` needs a value.`, line, lineColumn(line, token.start)));
      break;
    }

    pairs.push({
      name: token.value,
      value: value.value
    });
    index = value.end;
  }

  const isComponent = refs.components.has(tag);
  if (isComponent) {
    return createViewNode("component", {
      line: line.line,
      tag,
      classExpression,
      props: pairs
    });
  }

  return createViewNode("element", {
    line: line.line,
    tag,
    text,
    eventName,
    eventExpression,
    classExpression,
    refName,
    attrs: pairs,
    bindings
  });
}

function parseViewLine(line: SourceLine, refs: ViewReferences, diagnostics: ViewDiagnostic[]): ViewNode | undefined {
  const trimmed = line.text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.startsWith("text ")) {
    return createViewNode("text", {
      line: line.line,
      text: trimmed.slice(5).trim()
    });
  }

  if (trimmed.startsWith("for ")) {
    const forMatch = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+?)\s+key\s+(.+)$/.exec(trimmed);
    if (!forMatch) {
      diagnostics.push(viewDiagnostic("WIB_VIEW_FOR", "List blocks must use `for item in items key item.id`.", line));
      return undefined;
    }

    return createViewNode("for", {
      line: line.line,
      itemName: forMatch[1],
      itemsExpression: forMatch[2]?.trim(),
      keyExpression: forMatch[3]?.trim()
    });
  }

  if (trimmed === "if" || trimmed.startsWith("if ")) {
    const condition = trimmed.slice(2).trim();
    if (!condition) {
      diagnostics.push(viewDiagnostic("WIB_VIEW_IF", "Conditional blocks must use `if condition`.", line));
      return undefined;
    }

    return createViewNode("if", {
      line: line.line,
      branches: [{
        condition,
        children: []
      }]
    });
  }

  if (trimmed.startsWith("slot")) {
    const slot = /^slot\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
    if (!slot) {
      diagnostics.push(viewDiagnostic("WIB_SLOT_NAME", "Slot blocks must declare a simple slot name, for example `slot actions`.", line));
      return undefined;
    }

    return createViewNode("slot", {
      line: line.line,
      slotName: slot[1]
    });
  }

  return parseTagLine(line, refs, diagnostics);
}

function childTarget(node: ViewNode): ViewNode[] {
  if (node.kind === "if") {
    const branch = node.branches[node.branches.length - 1];
    return branch?.children ?? node.children;
  }

  return node.children;
}

export function parseViewTree(section: WibSection | undefined, refs: ViewReferences): ViewParseResult {
  const root = createViewNode("root", { line: section?.line ?? 1 });
  const diagnostics: ViewDiagnostic[] = [];
  if (!section) {
    return { tree: root, diagnostics };
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
        diagnostics.push(viewDiagnostic("WIB_VIEW_ELSE", "`else` must directly follow an `if` block at the same indentation.", line));
        continue;
      }

      previous.branches.push({
        condition: trimmed.startsWith("else if ") ? trimmed.slice(8).trim() : undefined,
        children: []
      });
      stack.push({ indent: currentIndent, node: previous });
      continue;
    }

    const node = parseViewLine(line, refs, diagnostics);
    if (!node) {
      continue;
    }

    stack.at(-1) && childTarget(stack.at(-1)!.node).push(node);
    if (["element", "component", "if", "for", "slot"].includes(node.kind)) {
      stack.push({ indent: currentIndent, node });
    }
  }

  return { tree: root, diagnostics };
}
