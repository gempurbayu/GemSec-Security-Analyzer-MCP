#!/usr/bin/env node

import * as fs from "fs/promises";
import * as path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SecurityAnalyzer } from "./services/securityAnalyzer.js";
import { formatTextReport } from "./reporters/textReporter.js";
import { generateHtmlReport } from "./reporters/htmlReporter.js";
import { AnalysisResult } from "./types.js";

const BEST_PRACTICES = `
🔒 SECURITY BEST PRACTICES - NextJS/React Applications

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

export function createSecurityAnalyzerServer(): Server {
  const server = new Server(
    {
      name: "security-analyzer",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const analyzer = new SecurityAnalyzer();
  registerListToolsHandler(server);
  registerCallToolHandler(server, analyzer);

  return server;
}

function registerListToolsHandler(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "analyze_file",
          description:
            "Analyze a single file for security vulnerabilities in NextJS/React TypeScript code",
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description: "Path to the file to analyze",
              },
            },
            required: ["file_path"],
          },
        },
        {
          name: "analyze_directory",
          description:
            "Recursively analyze all TypeScript/JavaScript files in a directory for security issues",
          inputSchema: {
            type: "object",
            properties: {
              directory_path: {
                type: "string",
                description: "Path to the directory to analyze",
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
      ],
    };
  });
}

function registerCallToolHandler(server: Server, analyzer: SecurityAnalyzer) {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "analyze_file") {
        const filePath = (args as { file_path: string }).file_path;
      const result = await analyzer.analyzeFile(filePath);
      const projectRoot = await resolveProjectRoot(filePath);
      return buildAnalysisResponse([result], projectRoot);
      }

      if (name === "analyze_directory") {
        const dirPath = (args as { directory_path: string }).directory_path;
      const results = await analyzer.analyzeDirectory(dirPath);
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
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}

async function buildAnalysisResponse(results: AnalysisResult[], outputRoot?: string) {
  const report = formatTextReport(results);
  const { htmlPath } = await generateHtmlReport(results, {
    outputRoot,
  });

  return {
    content: [
      {
        type: "text",
        text: `${report}\n🌐 HTML preview generated at: ${htmlPath}`,
      },
    ],
  };
}

async function main() {
  const server = createSecurityAnalyzerServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Security Analyzer MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

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

