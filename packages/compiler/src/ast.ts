export type WibKind = "component" | "store";

export type SectionKind =
  | "props"
  | "state"
  | "derived"
  | "resource"
  | "actions"
  | "effects"
  | "view"
  | "style"
  | "provide"
  | "use";

export interface SourceLine {
  readonly line: number;
  readonly indent: number;
  readonly text: string;
}

export interface WibSection {
  readonly kind: SectionKind;
  readonly name?: string;
  readonly header: string;
  readonly line: number;
  readonly lines: SourceLine[];
}

export interface WibDocument {
  readonly kind: WibKind;
  readonly name: string;
  readonly filename?: string;
  readonly sections: WibSection[];
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly filename?: string;
  readonly line: number;
  readonly column: number;
}

export interface Declaration {
  readonly name: string;
  readonly type: string;
  readonly expression?: string;
  readonly line: number;
}

export interface ActionBlock {
  readonly name: string;
  readonly async: boolean;
  readonly params: string;
  readonly lines: SourceLine[];
  readonly line: number;
}
