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
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Find project root by looking for markers
    let current = path.resolve(process.cwd());
    const markers = ["package.json", "pnpm-workspace.yaml", "yarn.lock", ".git", "tsconfig.json"];

    while (true) {
      for (const marker of markers) {
        try {
          await fs.access(path.join(current, marker));
          return path.resolve(current, filePath);
        } catch {
          // Continue checking other markers
        }
      }

      const parent = path.dirname(current);
      if (parent === current) {
        // Reached filesystem root, use cwd as fallback
        return path.resolve(process.cwd(), filePath);
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
    } else {
      // Resolve path and read from filesystem
      const resolvedPath = await this.resolveFilePath(filePath);
      content = await fs.readFile(resolvedPath, "utf-8");
      actualFilePath = resolvedPath;
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
   * Analyze multiple files from their content (for remote MCP servers)
   */
  async analyzeFilesFromContent(
    files: Array<{ path: string; content: string }>
  ): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    for (const file of files) {
      if (!this.shouldAnalyzeFile(file.path)) {
        continue;
      }

      try {
        const result = await this.analyzeFile(file.path, file.content);
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

    // Resolve path and verify it's a directory
    const resolvedPath = await this.resolveFilePath(dirPath);
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
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

