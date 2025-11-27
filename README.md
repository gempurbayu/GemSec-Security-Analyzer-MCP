# GemSec MCP Server

GemSec is a Model Context Protocol (MCP) tool that scans JavaScript/TypeScript codebases (Next.js/React friendly) for common security pitfalls, then produces actionable CLI and HTML reports with contextual snippets, debugging prompts, and deep links.

## Key Features

- **Recursive Analysis** – Scan an individual file or an entire directory (skipping `node_modules`, dot folders, and non JS/TS extensions).
- **Rule Library** – Detects XSS risks, missing CSRF tokens, hardcoded secrets, SQL injection patterns, weak crypto, insecure storage, and more (see `src/config/securityPatterns.ts`).
- **Rich Reporting**
  - Terminal output with severity badges, code snippets, VS Code deep links, and suggested prompts for debugging.
  - Styled HTML report (`reports/security-report-*/index.html`) generated inside the root of the analyzed project.
- **Best Practices Helper** – Quick reference guide for hardened Next.js/React deployments.

## Installation

```bash
git clone https://github.com/your-org/gemsec-mcp.git
cd gemsec-mcp
npm install
npm run build
```

GemSec is exposed via the `gemsec` binary defined in `package.json`. After building, tools can call `./build/index.js` directly (it exports the MCP server).

## Available MCP Tools

| Tool Name | Description | Arguments |
|-----------|-------------|-----------|
| `analyze_file` | Scan a single file | `{ "file_path": "/abs/path/to/file.tsx" }` |
| `analyze_directory` | Recursively scan a folder for JS/TS files | `{ "directory_path": "/abs/path/to/project" }` |
| `get_security_best_practices` | Returns the curated best-practices checklist | none |

### Typical Workflow

1. **Start the MCP server**
   ```bash
   node ./build/index.js
   ```
2. **Call `analyze_directory`**
   ```json
   {
     "name": "analyze_directory",
     "arguments": { "directory_path": "/Users/me/projects/test-project" }
   }
   ```
3. **Open the HTML report**
   - GemSec determines the project root (presence of `package.json`, `.git`, `pnpm-workspace.yaml`, or `yarn.lock`) and writes the report under `<project>/reports/security-report-*/`.
   - The CLI response includes the exact `index.html` path plus embedded VS Code links for each finding.

## IDE / Cursor Integration

GemSec is an MCP server, so any MCP-aware IDE (such as Cursor) can invoke it directly.

1. **Register the server in Cursor**
   - Open `Settings → Features → MCP Servers`.
   - Add a new custom server with:
     - **Name:** `gemsec`
     - **Command:** `node`
     - **Args:** `["/absolute/path/to/gemsec-mcp/build/index.js"]`
   - Save; restart Cursor if prompted.

2. **Prompting the assistant**
   - Mention GemSec or the tool you want, e.g. “Run GemSec `analyze_directory` on `src/features/log-activity`” or “Use GemSec to analyze `FormAddNewUser.tsx`.”
   - Cursor will surface the GemSec tools (`analyze_file`, `analyze_directory`, `get_security_best_practices`) in the tool picker.

3. **Handling results**
   - The response includes a Markdown summary plus the HTML path. Open the `index.html` inside your project (e.g. `…/reports/security-report-*/index.html`).
   - Use the VS Code `vscode://file/...` links embedded in the text or HTML report to jump straight to the relevant lines.

## Development Guide

- **Source Layout**
  - `src/index.ts` – MCP server bootstrap (registers tools, handles routing, resolves project roots).
  - `src/services/securityAnalyzer.ts` – Core scanner; reads files and applies regex-based rules defined in `src/config/securityPatterns.ts`.
  - `src/reporters/*.ts` – Text and HTML reporting pipelines.
  - `src/types.ts` – Shared interfaces (`SecurityIssue`, `SecurityPattern`, etc.).
- **Commands**
  - `npm run build` – Compile TypeScript to `build/`.
  - `npm run dev` – TypeScript watch mode.
- **Extending Rules**
  - Add new entries to `securityPatterns.ts`.
  - Each pattern requires a name, regex, severity, message, and recommendation.
- **Adding Tools**
  - Update `registerListToolsHandler` + `registerCallToolHandler` in `src/index.ts`.

## Output Anatomy

Each finding contains:

- **Severity & Type** – e.g., `HIGH — Missing CSRF Protection`.
- **Line + Code** – Source line and the specific snippet.
- **Context Block** – Multi-line excerpt with highlighting for quick review.
- **Recommendation** – Suggested remediation.
- **Debug Prompt** – Plain-text instruction suitable for AI pair programming or issue tracking.
- **VS Code Deep Link** – `vscode://file/<path>:<line>` to jump directly into the file.

## Troubleshooting

- **Report path not under your repo?** Ensure the analyzed directory contains a project marker (`package.json`, `.git`, etc.). GemSec walks up the filesystem until it finds one.
- **Missing findings?** Only `.ts`, `.tsx`, `.js`, and `.jsx` files are scanned.
- **Custom report locations?** Pass an absolute path via `analyze_directory` or `analyze_file`; GemSec will infer the nearest project root automatically.

## License

MIT – see `LICENSE` (or add one if missing).

