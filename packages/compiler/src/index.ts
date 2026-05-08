import type { Diagnostic, WibDocument } from "./ast";
import { emitDeclarations, emitTypeScript, type DeclarationEmitResult, type EmitResult } from "./emit";
import { explainAst, explainWib } from "./explain";
import { formatAst, formatWib } from "./format";
import { parseWib } from "./parse";
import { validateWib } from "./validate";

export interface CompileOptions {
  readonly filename?: string;
  readonly emitOnError?: boolean;
}

export interface CompileResult extends EmitResult {
  readonly ast?: WibDocument;
  readonly declarations: DeclarationEmitResult;
  readonly diagnostics: Diagnostic[];
}

export function compileWib(source: string, options: CompileOptions = {}): CompileResult {
  const parsed = parseWib(source, options.filename);
  if (!parsed.ast) {
    return {
      code: "",
      map: null,
      declarations: { code: "", map: null },
      diagnostics: parsed.diagnostics
    };
  }

  const diagnostics = [...parsed.diagnostics, ...validateWib(parsed.ast)];
  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  if (hasError && !options.emitOnError) {
    return {
      ast: parsed.ast,
      code: "",
      map: null,
      declarations: { code: "", map: null },
      diagnostics
    };
  }

  return {
    ast: parsed.ast,
    declarations: emitDeclarations(parsed.ast),
    diagnostics,
    ...emitTypeScript(parsed.ast)
  };
}

export {
  emitDeclarations,
  emitTypeScript,
  explainAst,
  explainWib,
  formatAst,
  formatWib,
  parseWib,
  validateWib
};

export type {
  DeclarationEmitResult,
  EmitResult
} from "./emit";

export type {
  ActionBlock,
  Declaration,
  Diagnostic,
  DiagnosticSeverity,
  SectionKind,
  SourceLine,
  WibDocument,
  WibKind,
  WibSection
} from "./ast";
