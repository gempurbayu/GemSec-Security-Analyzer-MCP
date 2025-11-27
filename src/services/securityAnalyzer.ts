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

  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const content = await fs.readFile(filePath, "utf-8");
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
      file: filePath,
      issues,
      summary: this.buildSummary(issues),
    };
  }

  async analyzeDirectory(dirPath: string): Promise<AnalysisResult[]> {
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

