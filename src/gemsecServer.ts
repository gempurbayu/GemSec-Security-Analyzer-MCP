#!/usr/bin/env node

import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SecurityAnalyzer } from "./services/securityAnalyzer.js";
import { formatTextReport } from "./reporters/textReporter.js";
import { generateHtmlReport } from "./reporters/htmlReporter.js";
import { AnalysisResult } from "./types.js";

const execAsync = promisify(exec);

export const TOOL_NAME = "GemSec";
const BEST_PRACTICES = `
🔒 ${TOOL_NAME.toUpperCase()} SECURITY BEST PRACTICES - NextJS/React Applications

1. 🛡️ INPUT VALIDATION & SANITIZATION
   - Validasi semua user input menggunakan zod, yup, atau joi
   - Sanitasi HTML menggunakan DOMPurify sebelum render
   - Implementasi rate limiting untuk API endpoints

2. 🔐 AUTHENTICATION & AUTHORIZATION
   - Gunakan NextAuth.js atau Auth0 untuk authentication
   - Simpan tokens di httpOnly cookies, bukan localStorage
   - Implementasi proper session management
   - Gunakan JWT dengan expiration time yang sesuai

3. 🌐 API SECURITY
   - Validasi dan sanitasi semua API inputs
   - Implementasi CSRF protection
   - Gunakan API rate limiting
   - Proper error handling (jangan expose stack traces)

4. 🔒 DATA PROTECTION
   - Enkripsi data sensitif in transit (HTTPS) dan at rest
   - Jangan hardcode secrets - gunakan environment variables
   - Gunakan .env.local dan tambahkan ke .gitignore
   - Rotate secrets secara berkala

5. 🛡️ XSS PREVENTION
   - Hindari dangerouslySetInnerHTML
   - Escape user-generated content
   - Implementasi Content Security Policy (CSP)
   - Sanitasi data sebelum render

6. 🔐 SECURITY HEADERS
   - Content-Security-Policy
   - X-Frame-Options: DENY
   - X-Content-Type-Options: nosniff
   - Strict-Transport-Security (HSTS)
   - Referrer-Policy

7. 📦 DEPENDENCIES
   - Audit dependencies: npm audit / yarn audit
   - Update dependencies secara berkala
   - Gunakan tools seperti Snyk atau Dependabot
   - Review third-party packages sebelum install

8. 🔍 CODE PRACTICES
   - No eval() or Function() constructor
   - Gunakan parameterized queries untuk database
   - Proper error handling tanpa information leakage
   - Code review fokus pada security

9. 🚀 DEPLOYMENT
   - Disable source maps di production
   - Minify dan obfuscate code
   - Implementasi proper logging dan monitoring
   - Regular security audits

10. ⚡ NEXT.JS SPECIFIC
    - Gunakan Server Components untuk sensitive operations
    - Implementasi proper API Routes protection
    - Use middleware for authentication checks
    - Proper environment variables handling
`;

export function createGemSecServer(): McpServer {
  const server = new McpServer(
    {
      name: "gemsec",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const analyzer = new SecurityAnalyzer();
  
  // Register handlers synchronously to ensure they're ready before connection
  registerListToolsHandler(server);
  registerCallToolHandler(server, analyzer);

  // Verify tools are registered
  // This ensures handlers are properly set up before the server is used

  return server;
}

function registerListToolsHandler(server: McpServer) {
  server.server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: "analyze_file",
        description:
          "Analyze a single file for security vulnerabilities in NextJS/React TypeScript code. For remote MCP servers, provide 'file_content' to send file content directly.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path to the file to analyze (used for reporting and local file access)",
            },
            file_content: {
              type: "string",
              description: "Optional: File content as string. Use this when using a remote MCP server to send file content directly instead of reading from filesystem.",
            },
          },
          required: ["file_path"],
        },
      },
      {
        name: "analyze_directory",
        description:
          "Recursively analyze all TypeScript/JavaScript files in a directory for security issues. For remote MCP servers, provide 'files' array to send file contents directly.",
        inputSchema: {
          type: "object",
          properties: {
            directory_path: {
              type: "string",
              description: "Path to the directory to analyze (used for reporting and local directory access)",
            },
            files: {
              type: "array",
              description: "Optional: Array of files with path and content. Use this when using a remote MCP server. Format: [{path: string, content: string}, ...]",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "File path (relative to directory_path or absolute)",
                  },
                  content: {
                    type: "string",
                    description: "File content as string",
                  },
                },
                required: ["path", "content"],
              },
            },
          },
          required: ["directory_path"],
        },
      },
      {
        name: "get_security_best_practices",
        description: "Get security best practices for NextJS/React applications",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ];

    return { tools };
  });
}

function registerCallToolHandler(server: McpServer, analyzer: SecurityAnalyzer) {
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "analyze_file") {
        const fileArgs = args as { file_path: string; file_content?: string };
        const filePath = fileArgs.file_path;
        const fileContent = fileArgs.file_content;
        
        const result = await analyzer.analyzeFile(filePath, fileContent);
        const projectRoot = await resolveProjectRoot(filePath);
        return buildAnalysisResponse([result], projectRoot);
      }

      if (name === "analyze_directory") {
        const dirArgs = args as {
          directory_path: string;
          files?: Array<{ path: string; content: string }>;
        };
        const dirPath = dirArgs.directory_path;
        const files = dirArgs.files;
        
        const results = await analyzer.analyzeDirectory(dirPath, files);
        const projectRoot = await resolveProjectRoot(dirPath);
        return buildAnalysisResponse(results, projectRoot);
      }

      if (name === "get_security_best_practices") {
        return {
          content: [
            {
              type: "text",
              text: BEST_PRACTICES,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  });
}

async function buildAnalysisResponse(
  results: AnalysisResult[],
  outputRoot?: string
) {
  const report = formatTextReport(results);
  const { htmlPath } = await generateHtmlReport(results, {
    outputRoot,
  });

  // Automatically open HTML report in default browser
  await openInBrowser(htmlPath);

  return {
    content: [
      {
        type: "text",
        text: `${report}\n🌐 HTML preview generated at: ${htmlPath}\n✅ Report opened in browser automatically`,
      },
    ],
  };
}

async function openInBrowser(filePath: string): Promise<void> {
  try {
    // Check if auto-open is disabled via environment variable
    if (process.env.GEMSEC_NO_AUTO_OPEN === "true") {
      return;
    }

    const platform = process.platform;
    let command: string;

    // Use absolute path and escape properly
    const absolutePath = path.resolve(filePath);

    switch (platform) {
      case "darwin": // macOS
        command = `open "${absolutePath}"`;
        break;
      case "win32": // Windows
        // Windows requires different escaping
        command = `start "" "${absolutePath.replace(/"/g, '\\"')}"`;
        break;
      case "linux": // Linux
        command = `xdg-open "${absolutePath}"`;
        break;
      default:
        console.warn(`Unsupported platform for auto-open: ${platform}`);
        return;
    }

    await execAsync(command);
    console.error(`✅ Opened report in browser: ${absolutePath}`);
  } catch (error) {
    // Silently fail - don't break the flow if browser can't be opened
    // This is non-critical, so we just log a warning
    console.warn(`⚠️  Failed to open browser automatically: ${error instanceof Error ? error.message : String(error)}`);
    console.warn(`   You can manually open: ${path.resolve(filePath)}`);
  }
}

async function resolveProjectRoot(targetPath: string): Promise<string> {
  let candidate = path.resolve(targetPath);
  const stats = await safeStat(candidate);
  if (!stats) {
    return path.dirname(candidate);
  }

  if (stats.isFile()) {
    candidate = path.dirname(candidate);
  }

  while (true) {
    if (await looksLikeProjectRoot(candidate)) {
      return candidate;
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return candidate;
    }
    candidate = parent;
  }
}

async function looksLikeProjectRoot(dir: string): Promise<boolean> {
  const markers = ["package.json", "pnpm-workspace.yaml", "yarn.lock", ".git"];
  for (const marker of markers) {
    if (await pathExists(path.join(dir, marker))) {
      return true;
    }
  }
  return false;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function safeStat(target: string) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

