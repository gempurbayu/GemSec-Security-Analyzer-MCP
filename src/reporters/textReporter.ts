import { AnalysisResult, SecurityIssue } from "../types.js";

export function formatTextReport(results: AnalysisResult[]): string {
  let report = "🔒 SECURITY CODE ANALYSIS REPORT\n";
  report += "=".repeat(60) + "\n\n";

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const totalCritical = results.reduce((sum, r) => sum + r.summary.critical, 0);
  const totalHigh = results.reduce((sum, r) => sum + r.summary.high, 0);
  const totalMedium = results.reduce((sum, r) => sum + r.summary.medium, 0);
  const totalLow = results.reduce((sum, r) => sum + r.summary.low, 0);

  report += `📊 RINGKASAN:\n`;
  report += `   Total File Analyzed: ${results.length}\n`;
  report += `   Total Issues: ${totalIssues}\n`;
  report += `   🔴 Critical: ${totalCritical}\n`;
  report += `   🟠 High: ${totalHigh}\n`;
  report += `   🟡 Medium: ${totalMedium}\n`;
  report += `   🟢 Low: ${totalLow}\n\n`;

  for (const result of results) {
    if (result.issues.length === 0) continue;

    report += `\n${"=".repeat(60)}\n`;
    report += `📄 FILE: ${result.file}\n`;
    report += `${"=".repeat(60)}\n\n`;

    const sortedIssues = sortBySeverity(result.issues);

    for (const issue of sortedIssues) {
      const icon = getSeverityIcon(issue.severity);

      report += `${icon} [${issue.severity.toUpperCase()}] ${issue.type}\n`;
      report += `   Line: ${issue.line}\n`;
      report += `   Code: ${issue.code}\n`;
      report += `   ⚠️  ${issue.message}\n`;
      report += `   ✅ ${issue.recommendation}\n`;
      report += `   📄 Context:\n${issue.context}\n`;
      report += `   🔗 Open: ${buildFileUrl(result.file, issue.line)}\n`;
      report += `   💡 Debug Prompt: ${buildDebugPrompt(result.file, issue)}\n\n`;
    }
  }

  return report;
}

function sortBySeverity(issues: SecurityIssue[]): SecurityIssue[] {
  const severityOrder: Record<SecurityIssue["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function getSeverityIcon(severity: SecurityIssue["severity"]): string {
  return {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  }[severity];
}

function buildDebugPrompt(file: string, issue: SecurityIssue): string {
  return `Investigate ${issue.severity.toUpperCase()} issue "${issue.type}" in ${file} line ${issue.line}. Use the snippet above to add a secure fix that addresses: ${issue.message} and apply: ${issue.recommendation}`;
}

function buildFileUrl(file: string, line: number): string {
  // Only encode characters that need encoding (spaces, special chars)
  // but keep the path readable
  const encodedPath = file.replace(/ /g, "%20").replace(/#/g, "%23");
  return `vscode://file/${encodedPath}:${line}`;
}

