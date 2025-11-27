#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGemSecServer, TOOL_NAME } from "./gemsecServer.js";

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

