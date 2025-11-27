import * as fs from "fs/promises";
import * as path from "path";
import { AnalysisResult, SecurityIssue } from "../types.js";

const PRODUCT_NAME = "GemSec";

interface HtmlReportOptions {
  outputRoot?: string;
}

export interface HtmlReportResult {
  directory: string;
  htmlPath: string;
  cssPath: string;
}

export async function generateHtmlReport(
  results: AnalysisResult[],
  options: HtmlReportOptions = {}
): Promise<HtmlReportResult> {
  const timestamp = new Date();
  const slug = timestamp.toISOString().replace(/[:.]/g, "-");
  const outputRoot = options.outputRoot ?? path.join(process.cwd(), "reports");
  const reportsDir = path.join(outputRoot, `security-report-${slug}`);
  await fs.mkdir(reportsDir, { recursive: true });

  const summary = buildSummary(results);
  const css = buildCss();
  const html = buildHtmlDocument(results, summary, timestamp.toLocaleString());

  const htmlPath = path.join(reportsDir, "index.html");
  const cssPath = path.join(reportsDir, "styles.css");

  await Promise.all([
    fs.writeFile(htmlPath, html, "utf-8"),
    fs.writeFile(cssPath, css, "utf-8"),
  ]);

  return { directory: reportsDir, htmlPath, cssPath };
}

function buildSummary(results: AnalysisResult[]) {
  return results.reduce(
    (acc, curr) => {
      acc.filesAnalyzed += 1;
      acc.totalIssues += curr.issues.length;
      acc.critical += curr.summary.critical;
      acc.high += curr.summary.high;
      acc.medium += curr.summary.medium;
      acc.low += curr.summary.low;
      return acc;
    },
    {
      filesAnalyzed: 0,
      totalIssues: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }
  );
}

function buildHtmlDocument(
  results: AnalysisResult[],
  summary: ReturnType<typeof buildSummary>,
  generatedAt: string
): string {
  const severityOrder: Record<SecurityIssue["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const fileSections =
    results.length > 0
      ? results
          .map((result) => {
            const sortedIssues = [...result.issues].sort(
              (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
            );

            const issuesHtml =
              sortedIssues.length > 0
                ? sortedIssues
                    .map((issue) => {
                      const debugPrompt = buildDebugPrompt(result.file, issue);
                      const fileLink = buildFileUrl(result.file, issue.line);

                      return `
                  <article class="issue-card severity-${issue.severity}">
                    <header>
                      <span class="severity-tag">${getSeverityIcon(issue.severity)} ${issue.severity.toUpperCase()}</span>
                      <h3>${escapeHtml(issue.type)}</h3>
                    </header>
                    <ul>
                      <li><strong>Line:</strong> ${issue.line}</li>
                      <li><strong>Code:</strong> <code>${escapeHtml(issue.code)}</code></li>
                      <li><strong>Open:</strong> <a href="${fileLink}">vscode://</a></li>
                    </ul>
                    <div class="issue-context">
                      <p class="section-title">Code snippet</p>
                      <pre><code>${escapeHtml(issue.context)}</code></pre>
                    </div>
                    <p class="issue-message">⚠️ ${escapeHtml(issue.message)}</p>
                    <p class="issue-recommendation">✅ ${escapeHtml(issue.recommendation)}</p>
                    <div class="issue-debug">
                      <p class="section-title">🧠 Debug prompt</p>
                      <pre>${escapeHtml(debugPrompt)}</pre>
                    </div>
                  </article>
                `;
                    })
                    .join("")
                : `<p class="no-issues">No security issues detected.</p>`;

            return `
              <section class="file-section">
                <div class="file-header">
                  <h2>${escapeHtml(result.file)}</h2>
                  <div class="file-stats">
                    <span>🔴 ${result.summary.critical}</span>
                    <span>🟠 ${result.summary.high}</span>
                    <span>🟡 ${result.summary.medium}</span>
                    <span>🟢 ${result.summary.low}</span>
                  </div>
                </div>
                ${issuesHtml}
              </section>
            `;
          })
          .join("")
      : `<section class="file-section">
            <p class="no-issues">No security issues detected in the analyzed scope.</p>
          </section>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${PRODUCT_NAME} Security Report</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="hero">
      <div>
        <p class="eyebrow">${PRODUCT_NAME} MCP</p>
        <h1>${PRODUCT_NAME} Code Analysis Report</h1>
        <p class="subtitle">Generated at ${escapeHtml(generatedAt)}</p>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <span>📁</span>
          <p>Files analyzed</p>
          <strong>${summary.filesAnalyzed}</strong>
        </div>
        <div class="summary-card">
          <span>⚠️</span>
          <p>Total issues</p>
          <strong>${summary.totalIssues}</strong>
        </div>
        <div class="summary-card">
          <span>🔴</span>
          <p>Critical</p>
          <strong>${summary.critical}</strong>
        </div>
        <div class="summary-card">
          <span>🟠</span>
          <p>High</p>
          <strong>${summary.high}</strong>
        </div>
        <div class="summary-card">
          <span>🟡</span>
          <p>Medium</p>
          <strong>${summary.medium}</strong>
        </div>
        <div class="summary-card">
          <span>🟢</span>
          <p>Low</p>
          <strong>${summary.low}</strong>
        </div>
      </div>
    </header>
    <main>
      ${fileSections}
    </main>
  </body>
</html>`;
}

function buildCss(): string {
  return `
:root {
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0f172a;
  background: #f8fafc;
}

body {
  margin: 0;
  background: linear-gradient(120deg, #0f172a 0%, #1d4ed8 100%);
  min-height: 100vh;
  padding: 2rem;
  box-sizing: border-box;
}

.hero {
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  padding: 2rem;
  border-radius: 24px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.35);
  margin-bottom: 2rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.75rem;
  margin: 0;
  color: #93c5fd;
}

.hero h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2.5rem;
}

.subtitle {
  margin: 0;
  color: #cbd5f5;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.summary-card {
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem;
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.summary-card p {
  margin: 0.25rem 0;
  color: #cbd5f5;
}

.summary-card strong {
  font-size: 1.5rem;
  color: #fff;
}

main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.file-section {
  background: #fff;
  border-radius: 20px;
  padding: 1.75rem;
  box-shadow: 0 25px 55px rgba(15, 23, 42, 0.12);
}

.file-header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
}

.file-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #0f172a;
}

.file-stats span {
  margin-left: 0.5rem;
  font-weight: 600;
}

.issue-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #f8fafc;
}

.issue-card header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.issue-card h3 {
  margin: 0;
  color: #0f172a;
}

.severity-tag {
  align-self: flex-start;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.severity-critical { border-color: rgba(239, 68, 68, 0.3); background: rgba(254, 226, 226, 0.6); }
.severity-critical .severity-tag { background: #ef4444; color: #fff; }

.severity-high { border-color: rgba(249, 115, 22, 0.3); background: rgba(255, 237, 213, 0.6); }
.severity-high .severity-tag { background: #f97316; color: #fff; }

.severity-medium { border-color: rgba(234, 179, 8, 0.3); background: rgba(254, 249, 195, 0.6); }
.severity-medium .severity-tag { background: #eab308; color: #fff; }

.severity-low { border-color: rgba(34, 197, 94, 0.3); background: rgba(220, 252, 231, 0.6); }
.severity-low .severity-tag { background: #22c55e; color: #fff; }

.issue-card ul {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.issue-card li {
  font-size: 0.95rem;
}

.issue-context,
.issue-debug {
  margin: 1rem 0;
}

.section-title {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #475569;
}

code {
  background: #0f172a;
  color: #fff;
  padding: 0.15rem 0.35rem;
  border-radius: 6px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.9rem;
}

pre {
  background: #0f172a;
  color: #f8fafc;
  padding: 0.75rem;
  border-radius: 12px;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.4;
}

.issue-message,
.issue-recommendation {
  margin: 0.5rem 0;
  font-weight: 500;
}

.no-issues {
  margin: 0;
  padding: 1rem;
  background: #ecfccb;
  border-radius: 12px;
  border: 1px solid #bef264;
  color: #365314;
  font-weight: 600;
}

@media (max-width: 768px) {
  body {
    padding: 1rem;
  }

  .file-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .issue-card ul {
    flex-direction: column;
    gap: 0.5rem;
  }
}
`;
}

function getSeverityIcon(severity: SecurityIssue["severity"]): string {
  return {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  }[severity];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDebugPrompt(file: string, issue: SecurityIssue): string {
  return `Investigate ${issue.severity.toUpperCase()} issue "${issue.type}" in ${file} line ${issue.line}. Context:\n${issue.context}\nMessage: ${issue.message}\nApply fix: ${issue.recommendation}`;
}

function buildFileUrl(file: string, line: number): string {
  // Only encode characters that need encoding (spaces, special chars)
  // but keep the path readable
  const encodedPath = file.replace(/ /g, "%20").replace(/#/g, "%23");
  return `vscode://file/${encodedPath}:${line}`;
}

