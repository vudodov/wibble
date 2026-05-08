function activate(context) {
  const vscode = require("vscode");
  const keywords = new Map([
    ["props", "Declare immutable component props."],
    ["state", "Declare local writable signal state."],
    ["derived", "Declare pure computed values."],
    ["resource", "Declare browser-side async data reads."],
    ["actions", "Declare mutation and event entry points."],
    ["view", "Declare DOM and component output."],
    ["slot", "Render caller-provided named content."],
    ["if", "Render a branch reactively."],
    ["for", "Render keyed repeated content."],
    ["bind", "Bind an input/select/checkbox to @wibble/forms field state."]
  ]);

  context.subscriptions.push(vscode.languages.registerHoverProvider("wibble", {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position);
      const word = range && document.getText(range);
      const text = word && keywords.get(word);
      return text ? new vscode.Hover(text) : undefined;
    }
  }));

  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider("wibble", {
    provideDocumentSymbols(document) {
      return document.getText().split(/\r?\n/).flatMap((line, index) => {
        const trimmed = line.trim();
        const header = /^(component|store)\s+([A-Z][A-Za-z0-9_]*)$/.exec(trimmed);
        if (header) {
          return [new vscode.SymbolInformation(
            header[2],
            header[1] === "component" ? vscode.SymbolKind.Class : vscode.SymbolKind.Object,
            "",
            new vscode.Location(document.uri, new vscode.Position(index, 0))
          )];
        }

        const section = /^(props|state|derived|actions|effects|view|style|provide|use|resource(?:\s+[A-Za-z_][A-Za-z0-9_]*)?)$/.exec(trimmed);
        if (section) {
          return [new vscode.SymbolInformation(
            trimmed,
            vscode.SymbolKind.Namespace,
            "",
            new vscode.Location(document.uri, new vscode.Position(index, 0))
          )];
        }

        const declaration = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(trimmed);
        if (declaration) {
          return [new vscode.SymbolInformation(
            declaration[1],
            vscode.SymbolKind.Variable,
            "",
            new vscode.Location(document.uri, new vscode.Position(index, line.indexOf(declaration[1])))
          )];
        }

        const action = /^(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\(/.exec(trimmed);
        if (action) {
          return [new vscode.SymbolInformation(
            action[1],
            vscode.SymbolKind.Function,
            "",
            new vscode.Location(document.uri, new vscode.Position(index, line.indexOf(action[1])))
          )];
        }

        return [];
      });
    }
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
