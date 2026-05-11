export interface ExpressionReferences {
  readonly props: Set<string>;
  readonly state: Set<string>;
  readonly derived: Set<string>;
  readonly resources: Set<string>;
  readonly locals?: Set<string>;
}

const resourceReadProperties = new Set(["data", "error", "status", "loading", "refreshing"]);

function isIdentifierStart(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z_]/.test(char));
}

function isIdentifierPart(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function readIdentifier(source: string, start: number): { value: string; end: number } | undefined {
  if (!isIdentifierStart(source[start])) {
    return undefined;
  }

  let end = start + 1;
  while (isIdentifierPart(source[end])) {
    end += 1;
  }

  return {
    value: source.slice(start, end),
    end
  };
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (/\s/.test(source[index] ?? "")) {
    index += 1;
  }
  return index;
}

function previousNonWhitespace(source: string, start: number): string | undefined {
  let index = start - 1;
  while (index >= 0 && /\s/.test(source[index] ?? "")) {
    index -= 1;
  }
  return source[index];
}

function nextNonWhitespace(source: string, start: number): string | undefined {
  const index = skipWhitespace(source, start);
  return source[index];
}

function readQuotedLiteral(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function readTemplateExpressionEnd(source: string, start: number): number {
  let depth = 1;
  let index = start;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\"" || char === "'") {
      index = readQuotedLiteral(source, index);
      continue;
    }

    if (char === "`") {
      index = readTemplateLiteral(source, index, { raw: true }).end;
      continue;
    }

    if (char === "/" && next === "/") {
      return source.length;
    }

    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end >= 0 ? end + 2 : source.length;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return source.length;
}

function readTemplateLiteral(
  source: string,
  start: number,
  options: { refs?: ExpressionReferences; raw?: boolean } = {}
): { value: string; end: number } {
  let output = "`";
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\\") {
      output += source.slice(index, Math.min(index + 2, source.length));
      index += 2;
      continue;
    }

    if (char === "`") {
      output += "`";
      return {
        value: output,
        end: index + 1
      };
    }

    if (!options.raw && options.refs && char === "$" && next === "{") {
      const expressionStart = index + 2;
      const expressionEnd = readTemplateExpressionEnd(source, expressionStart);
      const expression = source.slice(expressionStart, expressionEnd);
      output += `\${${transformExpression(expression, options.refs)}}`;
      index = Math.min(expressionEnd + 1, source.length);
      continue;
    }

    output += char;
    index += 1;
  }

  return {
    value: output,
    end: source.length
  };
}

function readResourceProperty(source: string, identifierEnd: number, identifier: string, refs: ExpressionReferences):
  | { property: string; end: number }
  | undefined {
  if (!refs.resources.has(identifier)) {
    return undefined;
  }

  const dotIndex = skipWhitespace(source, identifierEnd);
  if (source[dotIndex] !== ".") {
    return undefined;
  }

  const propertyStart = skipWhitespace(source, dotIndex + 1);
  const property = readIdentifier(source, propertyStart);
  if (!property || !resourceReadProperties.has(property.value)) {
    return undefined;
  }

  return {
    property: property.value,
    end: property.end
  };
}

function shouldKeepIdentifier(identifier: string, start: number, end: number, source: string, refs: ExpressionReferences): boolean {
  const locals = refs.locals ?? new Set<string>();
  const previous = previousNonWhitespace(source, start);
  const next = nextNonWhitespace(source, end);

  return previous === "." || locals.has(identifier) || (next === ":" && previous !== "?");
}

export function transformExpression(expression: string, refs: ExpressionReferences): string {
  let output = "";
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    const next = expression[index + 1];

    if (char === "\"" || char === "'") {
      const end = readQuotedLiteral(expression, index);
      output += expression.slice(index, end);
      index = end;
      continue;
    }

    if (char === "`") {
      const template = readTemplateLiteral(expression, index, { refs });
      output += template.value;
      index = template.end;
      continue;
    }

    if (char === "/" && next === "/") {
      output += expression.slice(index);
      break;
    }

    if (char === "/" && next === "*") {
      const end = expression.indexOf("*/", index + 2);
      const commentEnd = end >= 0 ? end + 2 : expression.length;
      output += expression.slice(index, commentEnd);
      index = commentEnd;
      continue;
    }

    const identifier = readIdentifier(expression, index);
    if (!identifier) {
      output += char;
      index += 1;
      continue;
    }

    const resourceRead = readResourceProperty(expression, identifier.end, identifier.value, refs);
    if (resourceRead) {
      output += `${identifier.value}.${resourceRead.property}.get()`;
      index = resourceRead.end;
      continue;
    }

    if (shouldKeepIdentifier(identifier.value, index, identifier.end, expression, refs)) {
      output += identifier.value;
      index = identifier.end;
      continue;
    }

    if (refs.props.has(identifier.value)) {
      output += `read(__props.${identifier.value})`;
    } else if (refs.state.has(identifier.value) || refs.derived.has(identifier.value)) {
      output += `${identifier.value}.get()`;
    } else {
      output += identifier.value;
    }

    index = identifier.end;
  }

  return output;
}

export function parseQuotedStringLiteral(expression: string): string | undefined {
  const trimmed = expression.trim();
  const quote = trimmed[0];
  if ((quote !== "\"" && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
    return undefined;
  }

  let output = "";
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    index += 1;
    const escaped = trimmed[index];
    output += ({
      "\"": "\"",
      "'": "'",
      "\\": "\\",
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f"
    } as Record<string, string>)[escaped ?? ""] ?? escaped ?? "";
  }

  return output;
}
