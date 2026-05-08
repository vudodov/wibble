# VS Code

`packages/vscode` contains the first VS Code extension wiring for Wibble:

- `.wib` language registration
- TextMate syntax highlighting
- hover text for framework keywords
- document symbols
- section-aware snippets

`@wibble/language-server` provides diagnostics, completions, hover text, formatting, document symbols, and simple local go-to-definition. It reuses compiler diagnostics so the CLI, Vite plugin, and editor report the same issues.
