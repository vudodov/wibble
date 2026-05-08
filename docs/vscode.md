# VS Code

`packages/vscode` contains the first Wibble extension wiring:

- `.wib` language registration,
- TextMate syntax highlighting,
- hover documentation for framework keywords,
- document symbols,
- section-aware snippets.

`@wibble/language-server` exposes editor-friendly helpers for diagnostics, completions, hover docs, formatting, document symbols, and simple local go-to-definition. The package intentionally reuses compiler diagnostics so CLI, Vite, and editor feedback stay consistent.
