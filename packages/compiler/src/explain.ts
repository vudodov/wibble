import type { WibDocument } from "./ast";
import { declarationNames, getSection, getSections, parseDeclarations, parseResourceShape } from "./inspect";
import { parseWib } from "./parse";

export function explainAst(ast: WibDocument): string {
  const props = declarationNames(parseDeclarations(getSection(ast, "props")));
  const state = declarationNames(parseDeclarations(getSection(ast, "state")));
  const derived = declarationNames(parseDeclarations(getSection(ast, "derived")));
  const resources = getSections(ast, "resource").map((section) => {
    const shape = parseResourceShape(section);
    return `${section.name ?? "resource"}: key=${shape.key?.text.trim().slice(4).trim() ?? "missing"}, load=${shape.load ? "yes" : "missing"}`;
  });

  const lines = [
    `${ast.kind} ${ast.name}`,
    "",
    "Reactive graph:",
    `- props: ${props.join(", ") || "none"}`,
    `- state: ${state.join(", ") || "none"}`,
    `- derived: ${derived.join(", ") || "none"}`,
    `- resources: ${resources.join("; ") || "none"}`,
    "",
    "Rendering model:",
    "- state, derived, props, and resources are read by generated DOM bindings",
    "- changed signals schedule only dependent bindings",
    "- actions are the only generated mutation entry points"
  ];

  return `${lines.join("\n")}\n`;
}

export function explainWib(source: string, filename?: string): { text: string; diagnostics: ReturnType<typeof parseWib>["diagnostics"] } {
  const parsed = parseWib(source, filename);
  if (!parsed.ast) {
    return { text: "", diagnostics: parsed.diagnostics };
  }

  return {
    text: explainAst(parsed.ast),
    diagnostics: parsed.diagnostics
  };
}
