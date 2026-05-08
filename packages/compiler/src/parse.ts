import type { Diagnostic, SectionKind, SourceLine, WibDocument, WibSection } from "./ast";

const sectionNames = new Set<SectionKind>([
  "props",
  "state",
  "derived",
  "actions",
  "effects",
  "view",
  "style",
  "provide",
  "use"
]);

export interface ParseResult {
  readonly ast?: WibDocument;
  readonly diagnostics: Diagnostic[];
}

function indentation(line: string): number {
  const match = /^ */.exec(line);
  return match?.[0].length ?? 0;
}

function diagnostic(message: string, line: number, filename?: string): Diagnostic {
  return {
    code: "WIB_PARSE",
    severity: "error",
    message,
    filename,
    line,
    column: 1
  };
}

export function parseWib(source: string, filename?: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const firstIndex = lines.findIndex((line) => line.trim().length > 0 && !line.trim().startsWith("#"));

  if (firstIndex < 0) {
    return {
      diagnostics: [diagnostic("Expected a component or store declaration.", 1, filename)]
    };
  }

  const firstLine = lines[firstIndex]?.trim() ?? "";
  const header = /^(component|store)\s+([A-Z][A-Za-z0-9_]*)$/.exec(firstLine);
  if (!header) {
    return {
      diagnostics: [diagnostic("The first declaration must be `component Name` or `store Name`.", firstIndex + 1, filename)]
    };
  }

  const sections: WibSection[] = [];
  let current: {
    kind: SectionKind;
    name?: string;
    header: string;
    line: number;
    lines: SourceLine[];
  } | undefined;

  function pushCurrent(): void {
    if (current) {
      sections.push(current as WibSection);
      current = undefined;
    }
  }

  for (let index = firstIndex + 1; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();
    const line = index + 1;

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const indent = indentation(raw);
    if (indent === 0) {
      pushCurrent();

      const resource = /^resource\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
      if (resource) {
        current = {
          kind: "resource",
          name: resource[1],
          header: trimmed,
          line,
          lines: []
        };
        continue;
      }

      if (sectionNames.has(trimmed as SectionKind)) {
        current = {
          kind: trimmed as SectionKind,
          header: trimmed,
          line,
          lines: []
        };
        continue;
      }

      diagnostics.push(diagnostic(`Unknown top-level section \`${trimmed}\`.`, line, filename));
      continue;
    }

    if (!current) {
      diagnostics.push(diagnostic("Indented content must belong to a section.", line, filename));
      continue;
    }

    current.lines.push({
      line,
      indent,
      text: raw
    });
  }

  pushCurrent();

  return {
    ast: {
      kind: header[1] as WibDocument["kind"],
      name: header[2] ?? "Anonymous",
      filename,
      sections
    },
    diagnostics
  };
}
