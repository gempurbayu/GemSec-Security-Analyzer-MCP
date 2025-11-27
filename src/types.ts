export type Severity = "critical" | "high" | "medium" | "low";

export interface SecurityIssue {
  severity: Severity;
  type: string;
  line: number;
  code: string;
  message: string;
  recommendation: string;
}

export interface SecuritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface AnalysisResult {
  file: string;
  issues: SecurityIssue[];
  summary: SecuritySummary;
}

export interface SecurityPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  message: string;
  recommendation: string;
}

