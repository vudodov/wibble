import type { ActionBlock, Declaration, SourceLine, WibDocument, WibSection } from "./ast";

export function getSections(ast: WibDocument, kind: WibSection["kind"]): WibSection[] {
  return ast.sections.filter((section) => section.kind === kind);
}

export function getSection(ast: WibDocument, kind: WibSection["kind"]): WibSection | undefined {
  return ast.sections.find((section) => section.kind === kind);
}

export function parseDeclarations(section: WibSection | undefined): Declaration[] {
  if (!section) {
    return [];
  }

  return section.lines.flatMap((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/.exec(line.text.trim());
    if (!match) {
      return [];
    }

    return [{
      name: match[1] ?? "",
      type: (match[2] ?? "unknown").trim(),
      expression: match[3]?.trim(),
      line: line.line
    }];
  });
}

export function parseResourceShape(section: WibSection): { key?: SourceLine; load?: SourceLine; refresh?: SourceLine } {
  const shape: { key?: SourceLine; load?: SourceLine; refresh?: SourceLine } = {};

  for (const line of section.lines) {
    const trimmed = line.text.trim();
    if (trimmed.startsWith("key:")) {
      shape.key = line;
    } else if (trimmed.startsWith("load:")) {
      shape.load = line;
    } else if (trimmed.startsWith("refresh:")) {
      shape.refresh = line;
    }
  }

  return shape;
}

export function parseActions(section: WibSection | undefined): ActionBlock[] {
  if (!section) {
    return [];
  }

  const actions: ActionBlock[] = [];
  let current: ActionBlock | undefined;
  const content = section.lines.filter((line) => line.text.trim().length > 0);
  const declarationIndent = content.length > 0 ? Math.min(...content.map((line) => line.indent)) : 2;

  for (const line of content) {
    const trimmed = line.text.trim();
    const declaration = /^(async\s+)?([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)$/.exec(trimmed);

    if (declaration && line.indent === declarationIndent) {
      current = {
        async: Boolean(declaration[1]),
        name: declaration[2] ?? "",
        params: declaration[3] ?? "",
        line: line.line,
        lines: []
      };
      actions.push(current);
      continue;
    }

    current?.lines.push(line);
  }

  return actions;
}

export function declarationNames(declarations: readonly Declaration[]): string[] {
  return declarations.map((declaration) => declaration.name);
}
