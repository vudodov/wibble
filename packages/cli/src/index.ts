#!/usr/bin/env node
import { compileWib, explainWib, formatWib, type Diagnostic } from "@wibble/compiler";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function print(message = ""): void {
  process.stdout.write(`${message}\n`);
}

function printError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function usage(): string {
  return [
    "Usage: wibble <command> [files-or-directories]",
    "",
    "Commands:",
    "  check      Validate .wib files",
    "  format     Format .wib files in place",
    "  types      Generate adjacent .wib.d.ts files",
    "  explain    Print the reactive graph for a .wib file",
    "  create     Scaffold a component or store",
    "",
    "Examples:",
    "  wibble check src",
    "  wibble format src/App.wib",
    "  wibble types src",
    "  wibble explain src/App.wib",
    "  wibble create component src/Counter.wib"
  ].join("\n");
}

async function types(targets: readonly string[]): Promise<number> {
  const files = await findWibFiles(targets);
  let errorCount = 0;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = compileWib(source, { filename: file, emitOnError: true });
    for (const diagnostic of result.diagnostics) {
      printError(formatDiagnostic(diagnostic));
      if (diagnostic.severity === "error") {
        errorCount += 1;
      }
    }

    if (errorCount === 0) {
      await writeFile(`${file}.d.ts`, result.declarations.code);
    }
  }

  print(`${files.length} .wib declaration file${files.length === 1 ? "" : "s"} generated.`);
  return errorCount === 0 ? 0 : 1;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = `${diagnostic.filename ?? "unknown"}:${diagnostic.line}:${diagnostic.column}`;
  return `${location} ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`;
}

async function findWibFiles(targets: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  const queue = targets.length > 0 ? [...targets] : ["."];

  while (queue.length > 0) {
    const target = queue.shift();
    if (!target) {
      continue;
    }

    const stats = await stat(target);
    if (stats.isDirectory()) {
      const entries = await readdir(target);
      for (const entry of entries) {
        if (entry === "node_modules" || entry === "dist") {
          continue;
        }
        queue.push(path.join(target, entry));
      }
      continue;
    }

    if (target.endsWith(".wib")) {
      files.push(target);
    }
  }

  return files.sort();
}

async function check(targets: readonly string[]): Promise<number> {
  const files = await findWibFiles(targets);
  let errorCount = 0;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = compileWib(source, { filename: file, emitOnError: true });
    for (const diagnostic of result.diagnostics) {
      printError(formatDiagnostic(diagnostic));
      if (diagnostic.severity === "error") {
        errorCount += 1;
      }
    }
  }

  print(`${files.length} .wib file${files.length === 1 ? "" : "s"} checked.`);
  return errorCount === 0 ? 0 : 1;
}

async function format(targets: readonly string[]): Promise<number> {
  const files = await findWibFiles(targets);
  let errorCount = 0;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = formatWib(source, file);
    for (const diagnostic of result.diagnostics) {
      printError(formatDiagnostic(diagnostic));
      if (diagnostic.severity === "error") {
        errorCount += 1;
      }
    }

    if (errorCount === 0 && result.code !== source) {
      await writeFile(file, result.code);
    }
  }

  print(`${files.length} .wib file${files.length === 1 ? "" : "s"} formatted.`);
  return errorCount === 0 ? 0 : 1;
}

async function explain(targets: readonly string[]): Promise<number> {
  if (targets.length !== 1) {
    printError("wibble explain expects exactly one .wib file.");
    return 1;
  }

  const file = targets[0] ?? "";
  const source = await readFile(file, "utf8");
  const result = explainWib(source, file);
  for (const diagnostic of result.diagnostics) {
    printError(formatDiagnostic(diagnostic));
  }
  print(result.text);
  return result.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0;
}

function componentTemplate(name: string): string {
  return `component ${name}

state
  count: number = 0

derived
  doubled: number = count * 2

actions
  increment()
    count = count + 1

view
  section class "counter"
    h1 text "${name}"
    p text "Count {count}"
    p text "Doubled {doubled}"
    button on click -> increment
      text "Increment"
`;
}

function storeTemplate(name: string): string {
  return `store ${name}

state
  items: unknown[] = []

derived
  count: number = items.length

actions
  clear()
    items = []
`;
}

async function create(args: readonly string[]): Promise<number> {
  const [kind, file] = args;
  if ((kind !== "component" && kind !== "store") || !file) {
    printError("wibble create expects `component <file>` or `store <file>`.");
    return 1;
  }

  const name = path.basename(file, ".wib").replace(/[^A-Za-z0-9_]/g, "");
  const source = kind === "component" ? componentTemplate(name) : storeTemplate(name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source, { flag: "wx" });
  print(`Created ${file}.`);
  return 0;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0] ?? "help";
  const args = argv.slice(1);

  if (command === "help" || command === "--help" || command === "-h") {
    print(usage());
    return 0;
  }

  if (command === "check") {
    return check(args);
  }

  if (command === "format") {
    return format(args);
  }

  if (command === "types") {
    return types(args);
  }

  if (command === "explain") {
    return explain(args);
  }

  if (command === "create") {
    return create(args);
  }

  printError(usage());
  return 1;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error: unknown) => {
  printError(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
