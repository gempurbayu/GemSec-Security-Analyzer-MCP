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

  /**
   * Check if a position is inside a regex literal
   * Regex literals have format /pattern/flags
   */
  private isInsideRegexLiteral(content: string, position: number): boolean {
    // Look backwards from position to find regex boundaries
    let i = position - 1;
    let foundClosingSlash = false;
    let closingSlashPos = -1;
    
    // First, find the closing / of regex (should be after position or at position)
    // Look forward a bit too in case we're in the middle
    for (let j = Math.max(0, position - 50); j < Math.min(content.length, position + 20); j++) {
      if (content[j] === "/" && j >= position) {
        // Check if followed by regex flags or end of expression
        const nextChar = content[j + 1];
        if (!nextChar || /[\s,;)\]}:=]/.test(nextChar) || /[gimsuvy]/.test(nextChar)) {
          closingSlashPos = j;
          foundClosingSlash = true;
          break;
        }
      }
    }
    
    if (!foundClosingSlash) return false;
    
    // Now look backwards from closing slash to find opening /
    i = Math.min(position, closingSlashPos) - 1;
    while (i >= 0 && i >= position - 200) { // Limit search to reasonable distance
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : "";
      
      if (char === "/") {
        // Not a comment start
        if (prevChar !== "/" && prevChar !== "*") {
          // Check if preceded by something that suggests regex (not division)
          const beforeChar = i > 1 ? content[i - 2] : "";
          if (
            i === 0 ||
            /[\s=:(\[{,;]/.test(prevChar) ||
            (prevChar && !/[a-zA-Z0-9_\)\]\}]/.test(prevChar))
          ) {
            // Found opening slash, check if position is between opening and closing
            return i < position && closingSlashPos >= position;
          }
        }
      }
      i--;
    }
    
    return false;
  }

  /**
   * Check if a position in the code is inside a string literal or comment
   */
  private isInsideStringOrComment(content: string, position: number): boolean {
    let i = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateLiteral = false;
    let inSingleLineComment = false;
    let inMultiLineComment = false;
    let escapeNext = false;

    while (i < position && i < content.length) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (escapeNext) {
        escapeNext = false;
        i++;
        continue;
      }

      // Handle escape sequences
      if (char === "\\") {
        escapeNext = true;
        i++;
        continue;
      }

      // Handle single-line comments
      if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral && !inMultiLineComment) {
        if (char === "/" && nextChar === "/") {
          inSingleLineComment = true;
          i += 2;
          continue;
        }
        if (char === "/" && nextChar === "*") {
          inMultiLineComment = true;
          i += 2;
          continue;
        }
      }

      // Handle multi-line comment end
      if (inMultiLineComment && char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        i += 2;
        continue;
      }

      // Handle newline (end single-line comment)
      if (inSingleLineComment && char === "\n") {
        inSingleLineComment = false;
      }

      // Handle string literals
      if (!inSingleLineComment && !inMultiLineComment) {
        if (char === "'" && !inDoubleQuote && !inTemplateLiteral) {
          inSingleQuote = !inSingleQuote;
        } else if (char === '"' && !inSingleQuote && !inTemplateLiteral) {
          inDoubleQuote = !inDoubleQuote;
        } else if (char === "`" && !inSingleQuote && !inDoubleQuote) {
          inTemplateLiteral = !inTemplateLiteral;
        }
      }

      i++;
    }

    return (
      inSingleQuote ||
      inDoubleQuote ||
      inTemplateLiteral ||
      inSingleLineComment ||
      inMultiLineComment
    );
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

        // Skip if match is inside string literal, comment, or regex literal
        // Check both start and end of match to be safe
        const matchStart = match.index;
        const matchEnd = matchStart + (match[0]?.length ?? 0);
        
        if (
          this.isInsideStringOrComment(content, matchStart) ||
          this.isInsideStringOrComment(content, matchEnd - 1) ||
          this.isInsideRegexLiteral(content, matchStart)
        ) {
          continue;
        }

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

