import type { Diagnostic, WibDocument, WibSection } from "./ast";
import { validateHtmlLine } from "./htmlSchema";
import { declarationNames, getSection, getSections, parseDeclarations, parseResourceShape } from "./inspect";

function diagnostic(
  ast: WibDocument,
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  line: number,
  column = 1
): Diagnostic {
  return {
    code,
    severity,
    message,
    filename: ast.filename,
    line,
    column
  };
}

function hasApiCall(text: string): boolean {
  return /\bfetch\s*\(/.test(text) || /\bapi\.[A-Za-z_]/.test(text);
}

function hasAssignmentTo(text: string, names: readonly string[]): string | undefined {
  return names.find((name) => new RegExp(`\\b${name}\\s*=`).test(text));
}

export function validateWib(ast: WibDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const props = parseDeclarations(getSection(ast, "props"));
  const state = parseDeclarations(getSection(ast, "state"));
  const stateNames = declarationNames(state);
  const propNames = declarationNames(props);

  for (const section of ast.sections) {
    if (section.kind === "view" || section.kind === "derived") {
      for (const line of section.lines) {
        if (hasApiCall(line.text)) {
          diagnostics.push(diagnostic(
            ast,
            "WIB_API_LOCATION",
            "error",
            `API reads are not allowed in ${section.kind}; move this request into a resource block.`,
            line.line
          ));
        }
      }
    }

    if (section.kind === "effects") {
      for (const line of section.lines) {
        if (hasApiCall(line.text)) {
          diagnostics.push(diagnostic(
            ast,
            "WIB_EFFECT_API",
            "warning",
            "Effects that call APIs are hard to replay and test; prefer a resource or action.",
            line.line
          ));
        }
      }
    }

    if (!["state", "actions"].includes(section.kind)) {
      for (const line of section.lines) {
        const name = hasAssignmentTo(line.text, stateNames);
        if (name) {
          diagnostics.push(diagnostic(
            ast,
            "WIB_MUTATION_LOCATION",
            "error",
            `State \`${name}\` can only be mutated inside actions.`,
            line.line
          ));
        }
      }
    }
  }

  for (const line of getSection(ast, "derived")?.lines ?? []) {
    if (/\bawait\b|\bnew\s+|=>\s*{/.test(line.text)) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_DERIVED_PURITY",
        "error",
        "Derived values must be synchronous pure expressions.",
        line.line
      ));
    }
  }

  for (const line of getSection(ast, "view")?.lines ?? []) {
    const text = line.text.trim();
    diagnostics.push(...validateHtmlLine(line).map((htmlDiagnostic) => ({
      ...htmlDiagnostic,
      filename: ast.filename
    })));

    if (text.startsWith("for ") && !/\skey\s+/.test(text)) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_LIST_KEY",
        "error",
        "List blocks must declare a stable key.",
        line.line
      ));
    }

    const slot = /^slot(?:\s+(.+))?$/.exec(text);
    if (slot && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(slot[1] ?? "")) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_SLOT_NAME",
        "error",
        "Slot blocks must declare a simple slot name, for example `slot actions`.",
        line.line
      ));
    }

    const invalidBind = /\bbind\s+(?!value\b|checked\b|group\b|files\b)([A-Za-z_][A-Za-z0-9_]*)/.exec(text);
    if (invalidBind) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_FORM_BINDING",
        "error",
        `Unsupported form binding \`${invalidBind[1]}\`; use \`bind value field\`, \`bind checked field\`, \`bind group field\`, or \`bind files field\`.`,
        line.line
      ));
    }

    const invalidRef = /\bref\b(?:\s+([^"\s][^\s]*))?/.exec(text);
    if (invalidRef && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(invalidRef[1] ?? "")) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_REF_NAME",
        "error",
        "Refs must name a local Ref value, for example `div ref panelRef`.",
        line.line
      ));
    }

    const valueBind = /\bbind\s+value\s+([A-Za-z_][A-Za-z0-9_.]*)/.exec(text);
    if (valueBind && !/^(input|textarea|select)\b/.test(text)) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_FORM_BINDING_TARGET",
        "error",
        "`bind value` can only be used on input, textarea, or select elements.",
        line.line
      ));
    }

    const checkedBind = /\bbind\s+checked\s+([A-Za-z_][A-Za-z0-9_.]*)/.exec(text);
    if (checkedBind && !/^input\b/.test(text)) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_FORM_BINDING_TARGET",
        "error",
        "`bind checked` can only be used on input elements.",
        line.line
      ));
    }

    const groupBind = /\bbind\s+group\s+([A-Za-z_][A-Za-z0-9_.]*)/.exec(text);
    if (groupBind && (!/^input\b/.test(text) || !/\btype\s+"radio"/.test(text))) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_FORM_BINDING_TARGET",
        "error",
        "`bind group` can only be used on input elements with `type \"radio\"`.",
        line.line
      ));
    }

    const filesBind = /\bbind\s+files\s+([A-Za-z_][A-Za-z0-9_.]*)/.exec(text);
    if (filesBind && (!/^input\b/.test(text) || !/\btype\s+"file"/.test(text))) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_FORM_BINDING_TARGET",
        "error",
        "`bind files` can only be used on input elements with `type \"file\"`.",
        line.line
      ));
    }

    const passThrough = propNames.find((name) => new RegExp(`\\b${name}\\s+${name}\\b`).test(text));
    if (passThrough) {
      diagnostics.push(diagnostic(
        ast,
        "WIB_PROP_FORWARD",
        "warning",
        `Prop \`${passThrough}\` appears to be forwarded unchanged; use slots, context, or a store if this repeats across components.`,
        line.line
      ));
    }
  }

  for (const section of getSections(ast, "resource")) {
    const shape = parseResourceShape(section);
    if (!shape.key) {
      diagnostics.push(diagnostic(ast, "WIB_RESOURCE_KEY", "error", `Resource \`${section.name}\` needs a stable key.`, section.line));
    }
    if (!shape.load) {
      diagnostics.push(diagnostic(ast, "WIB_RESOURCE_LOAD", "error", `Resource \`${section.name}\` needs a load expression.`, section.line));
    }
  }

  return diagnostics;
}
