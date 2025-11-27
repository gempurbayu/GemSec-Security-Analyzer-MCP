#!/usr/bin/env node

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { createGemSecServer, TOOL_NAME } from "./gemsecServer.js";

const PORT = Number(process.env.PORT ?? 3030);
const transports = new Map<string, StreamableHTTPServerTransport>();

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS middleware for development (optional)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Cache-Control");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/healthz", (_req, res) => {
  // Verify server can be created (quick health check)
  try {
    const testServer = createGemSecServer();
    res.json({
      status: "ok",
      name: TOOL_NAME,
      transport: "streamable-http",
      activeSessions: transports.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      name: TOOL_NAME,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Streamable HTTP: Single endpoint that handles both GET (SSE stream) and POST (requests)
// This is the modern standard according to MCP spec
app.get("/mcp", async (req, res) => {
  await handleMCPRequest(req, res);
});

app.post("/mcp", async (req, res) => {
  await handleMCPRequest(req, res);
});

// Backward compatibility: Also support legacy SSE endpoints
// GET /sse for SSE stream (legacy)
app.get("/sse", async (req, res) => {
  await handleMCPRequest(req, res);
});

// POST /sse for requests (legacy - some clients may POST here)
app.post("/sse", async (req, res) => {
  await handleMCPRequest(req, res);
});

// POST /messages for requests (legacy SSE pattern)
app.post("/messages", async (req, res) => {
  await handleMCPRequest(req, res);
});

async function handleMCPRequest(req: express.Request, res: express.Response) {
  try {
    // Extract session ID from headers (preferred) or query parameter
    const sessionId = 
      (req.headers["mcp-session-id"] as string | undefined) ||
      (req.query.sessionId as string | undefined);
    
    let transport: StreamableHTTPServerTransport | undefined;

    // Check if we have an existing transport for this session
    if (sessionId && transports.has(sessionId)) {
      // Existing session - reuse transport
      transport = transports.get(sessionId);
      if (!transport) {
        if (!res.headersSent) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "Session not found"
            },
            id: null
          });
        }
        return;
      }
    } else if (!sessionId && (req.method === "GET" || (req.method === "POST" && isInitializeRequest(req.body)))) {
      // New session - create transport and server
      const server = createGemSecServer();
      
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.log(`Streamable HTTP session initialized: ${sid}`);
          // Store transport when session is initialized to avoid race conditions
          if (transport) {
            transports.set(sid, transport);
          }
        },
        onsessionclosed: (sid) => {
          console.log(`Streamable HTTP session closed: ${sid}`);
          transports.delete(sid);
        },
      });

      // Set up cleanup handlers
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid && transports.has(sid)) {
          console.log(`Transport closed for session ${sid}`);
          transports.delete(sid);
        }
      };

      transport.onerror = (error) => {
        const sid = transport?.sessionId;
        console.error(`Transport error for session ${sid}:`, error);
        if (sid) {
          transports.delete(sid);
        }
      };

      // Connect server to transport before handling request
      const connectPromise = server.connect(transport);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Connection timeout")), 10000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      
      // Small delay to ensure initialization is complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Handle the request immediately after connecting (for initialization)
      const parsedBody = req.method === "POST" ? req.body : undefined;
      await transport.handleRequest(req, res, parsedBody);
      return; // Already handled
    } else if (sessionId && !transports.has(sessionId)) {
      // Session ID provided but not found
      if (!res.headersSent) {
        res.status(404).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Session not found",
            data: { sessionId, availableSessions: Array.from(transports.keys()) }
          },
          id: null
        });
      }
      return;
    } else {
      // Invalid request - no session ID and not an initialization request
      if (!res.headersSent) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided and request is not an initialization"
          },
          id: null
        });
      }
      return;
    }

    // Handle the request with existing transport
    if (!transport) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error: Failed to retrieve transport"
          },
          id: null
        });
      }
      return;
    }

    const parsedBody = req.method === "POST" ? req.body : undefined;
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: error instanceof Error ? error.message : String(error)
        },
        id: null
      });
    }
  }
}


app.listen(PORT, () => {
  console.log(`${TOOL_NAME} MCP Streamable HTTP server listening on port ${PORT}`);
  console.log(`Primary endpoint: GET/POST /mcp (Streamable HTTP standard)`);
  console.log(`Legacy endpoints: GET/POST /sse, POST /messages (for backward compatibility)`);
});

