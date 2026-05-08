import { compileWib, type Diagnostic } from "@wibble/compiler";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild, type Plugin } from "vite";

function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = `${diagnostic.filename ?? "unknown"}:${diagnostic.line}:${diagnostic.column}`;
  return `${location} ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`;
}

export interface WibblePluginOptions {
  readonly emitOnError?: boolean;
}

export default function wibble(options: WibblePluginOptions = {}): Plugin {
  async function compile(source: string, id: string, context: { error(message: string): never; warn(message: string): void }) {
    const filename = id.split("?")[0] ?? id;
    const result = compileWib(source, {
      filename,
      emitOnError: options.emitOnError
    });
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

    if (errors.length > 0) {
      context.error(errors.map(formatDiagnostic).join("\n"));
    }

    for (const warning of result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning")) {
      context.warn(formatDiagnostic(warning));
    }

    return transformWithEsbuild(result.code, `${filename}.ts`, {
      loader: "ts",
      sourcemap: true,
      sourcefile: filename
    });
  }

  return {
    name: "wibble",
    enforce: "pre",
    async load(id) {
      const filename = id.split("?")[0] ?? id;
      if (!filename.endsWith(".wib")) {
        return null;
      }

      const source = await readFile(filename, "utf8");
      return compile(source, filename, this);
    },
    transform(source, id) {
      const filename = id.split("?")[0] ?? id;
      if (!filename.endsWith(".wib") || !/^\s*(component|store)\s+/.test(source)) {
        return null;
      }

      return compile(source, filename, this);
    }
  };
}

export { wibble };
