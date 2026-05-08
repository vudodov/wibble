import type { WibDocument, WibSection } from "./ast";
import { parseWib } from "./parse";

const sectionOrder = new Map<string, number>([
  ["props", 0],
  ["use", 1],
  ["provide", 2],
  ["state", 3],
  ["derived", 4],
  ["resource", 5],
  ["actions", 6],
  ["effects", 7],
  ["view", 8],
  ["style", 9]
]);

function sortSections(sections: readonly WibSection[]): WibSection[] {
  return [...sections].sort((left, right) => {
    const leftOrder = sectionOrder.get(left.kind) ?? 99;
    const rightOrder = sectionOrder.get(right.kind) ?? 99;
    return leftOrder - rightOrder || left.line - right.line;
  });
}

export function formatAst(ast: WibDocument): string {
  const output: string[] = [`${ast.kind} ${ast.name}`];

  for (const section of sortSections(ast.sections)) {
    output.push("");
    output.push(section.header);
    for (const line of section.lines) {
      output.push(line.text.trimEnd());
    }
  }

  output.push("");
  return output.join("\n");
}

export function formatWib(source: string, filename?: string): { code: string; diagnostics: ReturnType<typeof parseWib>["diagnostics"] } {
  const parsed = parseWib(source, filename);
  if (!parsed.ast) {
    return { code: source, diagnostics: parsed.diagnostics };
  }

  return {
    code: formatAst(parsed.ast),
    diagnostics: parsed.diagnostics
  };
}
