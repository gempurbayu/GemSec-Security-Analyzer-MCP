# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Released]

## [1.3.0] - 2025-11-29

### Added
- **Detailed security pattern explanations**: All security patterns now include comprehensive `explanation` field
  - Each pattern includes detailed explanation of the vulnerability, attack vectors, and potential impact
  - Explanations help developers understand why each pattern is flagged and the security implications
- **Security Patterns documentation**: Added comprehensive "Security Patterns" section to README.md
  - Pattern overview table with all 14 security patterns organized by severity
  - Detailed descriptions for each pattern grouped by severity level (Critical, High, Medium, Low)
  - Guide for extending security patterns with custom rules

### Changed
- **Internationalization**: All security pattern messages, recommendations, and explanations converted from Indonesian to English
  - Improved accessibility for international developers
  - Consistent English language throughout the codebase
- **SecurityPattern interface**: Added optional `explanation` field to `SecurityPattern` type definition
  - Allows for detailed vulnerability explanations in pattern definitions
  - Maintains backward compatibility with existing patterns

## [1.2.1] - 2025-11-28

### Changed
- Updated repository URL in package.json to point to the correct GitHub repository

## [1.2.0] - 2025-11-27

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

[Unreleased]: https://github.com/gempurbayu/GemSec-Security-Analyzer/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/gempurbayu/GemSec-Security-Analyzer/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/gempurbayu/GemSec-Security-Analyzer/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/gempurbayu/GemSec-Security-Analyzer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gempurbayu/GemSec-Security-Analyzer/releases/tag/v1.1.0

