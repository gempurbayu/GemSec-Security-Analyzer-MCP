# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Released]

## [1.2.0] - 2025-01-27

### Fixed
- **Reduced false positives**: Security analyzer now ignores patterns that are inside string literals, comments, and regex literals
  - Patterns inside string literals (`'...'`, `"..."`, `` `...` ``) are no longer detected as issues
  - Patterns inside comments (`// ...`, `/* ... */`) are no longer detected as issues
  - Patterns inside regex literals (`/pattern/flags`) are no longer detected as issues
  - This fixes false positive issues in configuration files like `securityPatterns.ts` that contain pattern definitions

### Added
- `isInsideStringOrComment()` function to detect if a position is inside a string literal or comment
- `isInsideRegexLiteral()` function to detect if a position is inside a regex literal
- Filter in `SecurityAnalyzer.analyzeFile()` to skip matches that are inside strings/comments/regex

### Changed
- Pattern matching logic is now more accurate by considering code context
- Security analysis now produces fewer false positives, especially in configuration files

## [1.1.0] - 2025-01-XX

### Added
- Initial release of gemsec-security-analyzer-mcp
- MCP server for security analysis of NextJS/React TypeScript code
- Support for single file and directory analysis
- HTML and text reporters for analysis results
- HTTP server for remote access
- Detection of various security patterns:
  - XSS vulnerabilities (dangerouslySetInnerHTML, eval)
  - Hardcoded secrets
  - Insecure storage (localStorage)
  - Missing input validation
  - SQL injection risks
  - Insecure random number generation
  - CORS misconfiguration
  - Insecure HTTP usage
  - Weak cryptography algorithms
  - Unsafe redirects
  - Missing CSRF protection
  - Exposed server information
  - Missing security headers

[Unreleased]: https://github.com/your-username/security-analyzer-mcp/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/your-username/security-analyzer-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/your-username/security-analyzer-mcp/releases/tag/v1.1.0

