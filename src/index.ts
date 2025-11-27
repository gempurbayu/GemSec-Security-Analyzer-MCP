#!/usr/bin/env node

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGemSecServer, TOOL_NAME } from "./gemsecServer.js";

// Get package.json path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, "..", "package.json");

// Check for version flag
const args = process.argv.slice(2);
if (args.includes("-v") || args.includes("--version")) {
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    console.log(packageJson.version);
    process.exit(0);
  } catch (error) {
    console.error("Error reading package.json:", error);
    process.exit(1);
  }
}

async function main() {
  const server = createGemSecServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${TOOL_NAME} MCP Server running on stdio`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

