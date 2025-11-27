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
   - **StdIO/CLI**
     ```bash
     node ./build/index.js
     ```
   - **Express + SSE backend**
     ```bash
     npm start
     # or: PORT=4000 node ./build/httpServer.js
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

### Setup with StdIO (Recommended for Cursor)

1. **Register the server in Cursor**
   - Open `Settings → Features → MCP Servers`.
   - Add a new custom server with the following configuration:
     ```json
     {
       "mcpServers": {
         "gemsec": {
           "command": "node",
           "args": ["/absolute/path/to/security-analyzer-mcp/build/index.js"]
         }
       }
     }
     ```
   - **Name:** `gemsec`
   - **Command:** `node`
   - **Args:** `["/absolute/path/to/security-analyzer-mcp/build/index.js"]`
   - Save; restart Cursor if prompted.

2. **Prompting the assistant**
   - Mention GemSec or the tool you want, e.g. "Run GemSec `analyze_directory` on `src/features/log-activity`" or "Use GemSec to analyze `FormAddNewUser.tsx`."
   - Cursor will surface the GemSec tools (`analyze_file`, `analyze_directory`, `get_security_best_practices`) in the tool picker.

3. **Handling results**
   - The response includes a Markdown summary plus the HTML path. Open the `index.html` inside your project (e.g. `…/reports/security-report-*/index.html`).
   - Use the VS Code `vscode://file/...` links embedded in the text or HTML report to jump straight to the relevant lines.

### Setup with SSE (Server-Sent Events)

To use SSE transport, you need to run the HTTP server first, then connect from the client using HTTP endpoints.

#### 1. Running HTTP Server

```bash
# Build the project first
npm run build

# Run HTTP server (default port 3030)
npm start

# Or with a custom port
PORT=8080 npm start
```

Server will run at `http://localhost:3030` (or the port you specify).

#### 2. Verify Server is Running

```bash
# Test health endpoint
curl http://localhost:3030/healthz

# Response:
# {
#   "status": "ok",
#   "name": "GemSec",
#   "transport": "sse"
# }
```

#### 3. Connect with Streamable HTTP Client

Streamable HTTP transport uses a single endpoint that handles both GET and POST:
- **GET/POST `/mcp`** - Primary endpoint (modern standard)
  - GET: Opens SSE stream (server → client)
  - POST: Sends requests to server (client → server)
- **Legacy endpoints** (for backward compatibility):
  - GET/POST `/sse` - Legacy SSE endpoint
  - POST `/messages` - Legacy message endpoint

**Example using curl for testing:**

```bash
# 1. Open SSE connection (will get sessionId from response headers)
curl -N http://localhost:3030/sse

# 2. In another terminal, send message (replace <sessionId> with ID from step 1)
curl -X POST http://localhost:3030/messages?sessionId=<sessionId> \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

#### 4. Configuration for Web-based MCP Clients

If you are using a web-based MCP client that supports SSE, the configuration is usually like this:

```json
{
  "mcpServers": {
    "gemsec-streamable": {
      "type": "streamable-http",
      "url": "http://localhost:3030/mcp"
    }
  }
}
```

**For legacy SSE clients:**
```json
{
  "mcpServers": {
    "gemsec-sse": {
      "url": "http://localhost:3030/sse",
      "transport": "sse",
      "headers" : "Bearer {your_token}"
    }
  }
}
```

**Note:** Cursor currently works better with StdIO transport. SSE transport is more suitable for:
- Web-based MCP clients
- Remote deployments (Azure, Docker, etc.)
- Integration with HTTP-based tools
- Multi-client scenarios

## Development Guide

- **Source Layout**
  - `src/gemsecServer.ts` – MCP server bootstrap (registers tools, handles routing, resolves project roots).
  - `src/index.ts` – StdIO entry point for CLI-oriented MCP clients.
  - `src/httpServer.ts` – Express + SSE transport so HTTP clients can connect over `/sse` and `/messages`.
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
  - Update `registerListToolsHandler` + `registerCallToolHandler` in `src/gemsecServer.ts`.

## Express + SSE Backend

The HTTP transport aligns with the Azure-ready blueprint described by Build5Nines for deploying TypeScript-based MCP servers with Express, Docker, and Azure Developer CLI [[source]](https://build5nines.com/how-to-build-and-deploy-an-mcp-server-with-typescript-and-azure-developer-cli-azd-using-azure-container-apps-and-docker/).

> 📖 **Complete SSE setup documentation**: See [SSE_SETUP.md](./SSE_SETUP.md) for detailed guide.

- **Endpoints**
  - `GET/POST /mcp` – Primary Streamable HTTP endpoint (modern standard). Handles both SSE streams (GET) and requests (POST) on a single endpoint.
  - `GET/POST /sse` – Legacy SSE endpoint (for backward compatibility).
  - `POST /messages` – Legacy message endpoint (for backward compatibility).
  - `GET /healthz` – Lightweight readiness probe that reports tool name and transport type.
- **Running locally**
  ```bash
  npm start            # defaults to port 3030
  PORT=8080 npm start  # override the port
  ```
- **Quick Test**
  ```bash
  # Test health endpoint
  curl http://localhost:3030/healthz
  
  # Expected: {"status":"ok","name":"GemSec","transport":"sse"}
  ```
- **Authentication (Optional)**
  - By default, the server runs without authentication (suitable for local development)
  - To enable token-based authentication, set the `GEMSEC_AUTH_TOKEN` environment variable:
    ```bash
    GEMSEC_AUTH_TOKEN=your-secret-token npm start
    ```
  - Clients must include the token in requests:
    - Header: `Authorization: Bearer your-secret-token`
    - Or query parameter: `?token=your-secret-token`
  - Note: "No stored tokens found" messages from the client are normal when authentication is disabled

- **Deployment hints**
  - Expose the same port you pass through `$PORT` and ensure your ingress preserves SSE headers.
  - When scaling beyond a single replica (e.g., multiple Azure Container App pods), configure session affinity so `/messages` requests reach the pod that owns the `/sse` stream.
  - The included `Dockerfile` already produces a minimal Node 20 runtime suitable for ACA or other container targets.
  - For production deployments, consider enabling authentication via `GEMSEC_AUTH_TOKEN`.

## Output Anatomy

Each finding contains:

- **Severity & Type** – e.g., `HIGH — Missing CSRF Protection`.
- **Line + Code** – Source line and the specific snippet.
- **Context Block** – Multi-line excerpt with highlighting for quick review.
- **Recommendation** – Suggested remediation.
- **Debug Prompt** – Plain-text instruction suitable for AI pair programming or issue tracking.
- **VS Code Deep Link** – `vscode://file/<path>:<line>` to jump directly into the file.

### Auto-Open Browser

When an HTML report is generated, it will automatically open in your default browser. This feature works on:
- **macOS**: Uses `open` command
- **Windows**: Uses `start` command
- **Linux**: Uses `xdg-open` command

To disable auto-open, set the environment variable:
```bash
GEMSEC_NO_AUTO_OPEN=true npm start
```

If auto-open fails (e.g., no browser available), the report path will still be shown in the response, and you can open it manually.

## Troubleshooting

- **Report path not under your repo?** Ensure the analyzed directory contains a project marker (`package.json`, `.git`, etc.). GemSec walks up the filesystem until it finds one.
- **Missing findings?** Only `.ts`, `.tsx`, `.js`, and `.jsx` files are scanned.
- **Custom report locations?** Pass an absolute path via `analyze_directory` or `analyze_file`; GemSec will infer the nearest project root automatically.

## License

MIT – see `LICENSE` (or add one if missing).

