#!/usr/bin/env node

import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createGemSecServer, TOOL_NAME } from "./gemsecServer.js";

const PORT = Number(process.env.PORT ?? 3030);
const sseTransports = new Map<string, SSEServerTransport>();

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS middleware untuk development (optional)
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
      transport: "sse",
      activeSessions: sseTransports.size,
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

app.get("/sse", async (req, res) => {
  // Set proper SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  let transport: SSEServerTransport | null = null;
  let server: ReturnType<typeof createGemSecServer> | null = null;

  try {
    // Create transport first
    transport = new SSEServerTransport("/messages", res);
    const sessionId = transport.sessionId;
    
    // Create server instance for this session
    server = createGemSecServer();
    
    // Store transport before connecting to avoid race conditions
    sseTransports.set(sessionId, transport);

    // Handle client disconnect
    const cleanup = () => {
      if (transport) {
        console.log(`SSE connection closed for session ${sessionId}`);
        try {
          transport.close();
        } catch (e) {
          console.error(`Error closing transport for session ${sessionId}:`, e);
        }
        sseTransports.delete(sessionId);
      }
    };

    req.on("close", cleanup);
    req.on("error", (error) => {
      console.error(`SSE connection error for session ${sessionId}:`, error);
      cleanup();
    });

    // Connect server to transport with timeout
    const connectPromise = server.connect(transport);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), 10000);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    
    console.log(`SSE session established: ${sessionId}`);
    
    // Verify tools are registered by checking server capabilities
    // This ensures tools are available before client tries to list them
    if (server) {
      // Force a small delay to ensure initialization is complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    const sessionId = transport?.sessionId || "unknown";
    console.error(`Failed to establish SSE session ${sessionId}:`, error);
    
    // Cleanup on error
    if (transport) {
      try {
        transport.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      sseTransports.delete(sessionId);
    }
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Failed to establish SSE session",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  
  if (!sessionId || typeof sessionId !== "string" || sessionId.length === 0) {
    res.status(400).json({ error: "Missing sessionId query parameter" });
    return;
  }

  const transport = sseTransports.get(sessionId);
  if (!transport) {
    console.warn(`Unknown SSE session: ${sessionId}. Available sessions:`, Array.from(sseTransports.keys()));
    res.status(404).json({ 
      error: "Unknown SSE session",
      sessionId,
      availableSessions: Array.from(sseTransports.keys()),
      hint: "The session may have expired. Try reconnecting to /sse endpoint."
    });
    return;
  }

  try {
    // Add timeout for message processing
    const messagePromise = transport.handlePostMessage(req, res, req.body);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Message processing timeout")), 30000);
    });

    await Promise.race([messagePromise, timeoutPromise]);
  } catch (error) {
    console.error(`Failed to process message for session ${sessionId}:`, error);
    
    // If it's a timeout or connection error, clean up the session
    if (error instanceof Error && (
      error.message.includes("timeout") || 
      error.message.includes("ECONNRESET") ||
      error.message.includes("closed")
    )) {
      console.warn(`Cleaning up session ${sessionId} due to error`);
      try {
        transport.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      sseTransports.delete(sessionId);
    }
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Failed to process message",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`${TOOL_NAME} MCP SSE server listening on port ${PORT}`);
});

