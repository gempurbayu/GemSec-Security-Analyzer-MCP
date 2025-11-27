import * as fs from "fs/promises";
import * as path from "path";
import { securityPatterns } from "../config/securityPatterns.js";
import {
  AnalysisResult,
  SecurityIssue,
  SecuritySummary,
  SecurityPattern,
} from "../types.js";

export class SecurityAnalyzer {
  private readonly extensions = [".ts", ".tsx", ".js", ".jsx"];

  constructor(private readonly patterns: SecurityPattern[] = securityPatterns) {}

  async analyzeFile(filePath: string, fileContent?: string): Promise<AnalysisResult> {
    let content: string;
    let actualFilePath: string = filePath;

    // If file content is provided, use it directly (for remote MCP servers)
    if (fileContent !== undefined) {
      content = fileContent;
      actualFilePath = filePath; // Keep original path for reporting
    } else {
      // Otherwise, try to read from filesystem
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(
          `File not found: ${filePath}\n\n` +
          `⚠️  REMOTE MCP SERVER DETECTED\n` +
          `When using a remote MCP server (cloud), the server cannot access files on your local filesystem.\n\n` +
          `Solutions:\n` +
          `1. Use a local MCP server (StdIO transport) for local file analysis\n` +
          `2. Provide file content directly using the 'file_content' parameter\n` +
          `3. Ensure the files are accessible on the remote server's filesystem\n\n` +
          `Example with file_content:\n` +
          `{\n` +
          `  "file_path": "/path/to/file.tsx",\n` +
          `  "file_content": "// file content here..."\n` +
          `}\n\n` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      content = await fs.readFile(filePath, "utf-8");
    }

    const lines = content.split("\n");
    const issues: SecurityIssue[] = [];

    for (const pattern of this.patterns) {
      const matches = content.matchAll(pattern.pattern);

      for (const match of matches) {
        if (match.index === undefined) continue;

        const lineNum = content.substring(0, match.index).split("\n").length;
        const lineContent = lines[lineNum - 1]?.trim() ?? "";

        issues.push({
          severity: pattern.severity,
          type: pattern.name,
          line: lineNum,
          code: lineContent,
          context: this.buildContextSnippet(lines, lineNum),
          message: pattern.message,
          recommendation: pattern.recommendation,
        });
      }
    }

    return {
      file: actualFilePath,
      issues,
      summary: this.buildSummary(issues),
    };
  }

  /**
   * Analyze file content directly (for remote MCP servers)
   */
  analyzeFileContent(filePath: string, fileContent: string): Promise<AnalysisResult> {
    return this.analyzeFile(filePath, fileContent);
  }

  /**
   * Analyze multiple files from their content (for remote MCP servers)
   */
  async analyzeFilesFromContent(
    files: Array<{ path: string; content: string }>
  ): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    for (const file of files) {
      // Only analyze TypeScript/JavaScript files
      if (!this.shouldAnalyzeFile(file.path)) {
        continue;
      }

      try {
        const result = await this.analyzeFileContent(file.path, file.content);
        if (result.issues.length > 0) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error analyzing ${file.path}:`, error);
      }
    }

    return results;
  }

  async analyzeDirectory(
    dirPath: string,
    files?: Array<{ path: string; content: string }>
  ): Promise<AnalysisResult[]> {
    // If files are provided directly, analyze them (for remote MCP servers)
    if (files && files.length > 0) {
      return this.analyzeFilesFromContent(files);
    }

    // Otherwise, try to read from filesystem
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not a directory")) {
        throw error;
      }
      throw new Error(
        `Directory not found: ${dirPath}\n\n` +
        `⚠️  REMOTE MCP SERVER DETECTED\n` +
        `When using a remote MCP server (cloud), the server cannot access directories on your local filesystem.\n\n` +
        `Solutions:\n` +
        `1. Use a local MCP server (StdIO transport) for local directory analysis\n` +
        `2. Provide files directly using the 'files' parameter (array of {path, content})\n` +
        `3. Ensure the directory is accessible on the remote server's filesystem\n\n` +
        `Example with files parameter:\n` +
        `{\n` +
        `  "directory_path": "/path/to/dir",\n` +
        `  "files": [\n` +
        `    { "path": "/path/to/file1.tsx", "content": "// content..." },\n` +
        `    { "path": "/path/to/file2.ts", "content": "// content..." }\n` +
        `  ]\n` +
        `}\n\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const results: AnalysisResult[] = [];

    const scan = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          await scan(fullPath);
          continue;
        }

        if (entry.isFile() && this.shouldAnalyzeFile(entry.name)) {
          try {
            const result = await this.analyzeFile(fullPath);
            if (result.issues.length > 0) {
              results.push(result);
            }
          } catch (error) {
            console.error(`Error analyzing ${fullPath}:`, error);
          }
        }
      }
    };

    await scan(dirPath);
    return results;
  }

  private shouldAnalyzeFile(fileName: string): boolean {
    return this.extensions.some((ext) => fileName.endsWith(ext));
  }

  private buildSummary(issues: SecurityIssue[]): SecuritySummary {
    return {
      critical: issues.filter((i) => i.severity === "critical").length,
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
    };
  }

  private buildContextSnippet(lines: string[], line: number, radius = 2): string {
    const start = Math.max(0, line - 1 - radius);
    const end = Math.min(lines.length, line + radius);
    return lines
      .slice(start, end)
      .map((content, idx) => {
        const currentLine = start + idx + 1;
        const prefix = currentLine === line ? ">" : " ";
        return `${prefix} ${currentLine.toString().padStart(4, " ")} | ${content}`;
      })
      .join("\n");
  }
}

