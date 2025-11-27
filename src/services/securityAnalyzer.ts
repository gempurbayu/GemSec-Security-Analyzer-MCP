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

  /**
   * Resolve a file path, handling both absolute and relative paths.
   * For relative paths, tries to resolve from project root.
   */
  private async resolveFilePath(filePath: string): Promise<string> {
    // If already absolute, return as is
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Try to find project root from current working directory
    const projectRoot = await this.findProjectRoot(process.cwd());
    
    // Resolve relative path from project root
    return path.resolve(projectRoot, filePath);
  }

  /**
   * Find project root by looking for markers like package.json, .git, etc.
   */
  private async findProjectRoot(startDir: string): Promise<string> {
    let current = path.resolve(startDir);

    while (true) {
      // Check for project markers
      const markers = ["package.json", "pnpm-workspace.yaml", "yarn.lock", ".git", "tsconfig.json"];
      for (const marker of markers) {
        try {
          await fs.access(path.join(current, marker));
          return current;
        } catch {
          // Continue checking other markers
        }
      }

      // Move up one directory
      const parent = path.dirname(current);
      if (parent === current) {
        // Reached filesystem root, return current working directory as fallback
        return process.cwd();
      }
      current = parent;
    }
  }

  async analyzeFile(filePath: string, fileContent?: string): Promise<AnalysisResult> {
    let content: string;
    let actualFilePath: string = filePath;

    // If file content is provided, use it directly (for remote MCP servers)
    if (fileContent !== undefined) {
      content = fileContent;
      actualFilePath = filePath; // Keep original path for reporting
    } else {
      // Resolve path to absolute path (from project root if relative)
      const resolvedPath = await this.resolveFilePath(filePath);
      
      // Otherwise, try to read from filesystem
      try {
        await fs.access(resolvedPath);
        actualFilePath = resolvedPath;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isENOENT = errorMessage.includes("ENOENT") || errorMessage.includes("no such file");
        
        if (isENOENT) {
          throw new Error(
            `File not found: ${filePath}\n` +
            `Resolved path: ${resolvedPath}\n` +
            `Current working directory: ${process.cwd()}\n\n` +
            `The file does not exist at the specified path. Please check:\n` +
            `1. The file path is correct (relative to current working directory)\n` +
            `2. The file exists in your project\n` +
            `3. If using a remote MCP server, provide 'file_content' parameter instead\n\n` +
            `Example with file_content (for remote servers):\n` +
            `{\n` +
            `  "file_path": "/path/to/file.tsx",\n` +
            `  "file_content": "// file content here..."\n` +
            `}`
          );
        }
        
        throw new Error(
          `Error accessing file ${resolvedPath}: ${errorMessage}`
        );
      }

      content = await fs.readFile(resolvedPath, "utf-8");
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

    // Resolve path to absolute path (from project root if relative)
    const resolvedPath = await this.resolveFilePath(dirPath);

    // Otherwise, try to read from filesystem
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not a directory")) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isENOENT = errorMessage.includes("ENOENT") || errorMessage.includes("no such file");
      
      if (isENOENT) {
        throw new Error(
          `Directory not found: ${dirPath}\n` +
          `Resolved path: ${resolvedPath}\n` +
          `Current working directory: ${process.cwd()}\n\n` +
          `The directory does not exist at the specified path. Please check:\n` +
          `1. The directory path is correct (relative to current working directory)\n` +
          `2. The directory exists in your project\n` +
          `3. If using a remote MCP server, provide 'files' parameter instead\n\n` +
          `Example with files parameter (for remote servers):\n` +
          `{\n` +
          `  "directory_path": "/path/to/dir",\n` +
          `  "files": [\n` +
          `    { "path": "/path/to/file1.tsx", "content": "// content..." },\n` +
          `    { "path": "/path/to/file2.ts", "content": "// content..." }\n` +
          `  ]\n` +
          `}`
        );
      }
      
      throw new Error(
        `Error accessing directory ${resolvedPath}: ${errorMessage}`
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

    await scan(resolvedPath);
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

