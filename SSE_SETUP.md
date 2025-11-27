# SSE (Server-Sent Events) Setup for GemSec MCP

This document explains how to set up and use the GemSec MCP Server with SSE transport.

## Prerequisites

1. Node.js 20+ installed
2. Project is built (`npm run build`)
3. Port to be used is available (default: 3030)

## Setup Steps

### 1. Build Project

```bash
npm install
npm run build
```

### 2. Run HTTP Server

```bash
# Default port 3030
npm start

# Or with a custom port
PORT=8080 npm start
```

Server will run and be ready to accept SSE connections.

### 3. Verify Server

Test endpoint health check:

```bash
curl http://localhost:3030/healthz
```

Expected response:
```json
{
  "status": "ok",
  "name": "GemSec",
  "transport": "sse"
}
```

## Endpoints

### GET `/sse`
Opens SSE stream connection. Client will receive:
- Session ID through response headers
- Event stream for server → client communication

**Headers sent:**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### POST `/messages?sessionId=<id>`
Sends message to server for a specific session.

**Query Parameters:**
- `sessionId` (required) - Session ID from SSE connection

**Request Body:**
JSON-RPC 2.0 format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### GET `/healthz`
Health check endpoint for monitoring.

## Usage Examples

### Using curl (Manual Test)

**Terminal 1 - Open SSE connection:**
```bash
curl -N -H "Accept: text/event-stream" http://localhost:3030/sse
```

You will see output like:
```
data: {"jsonrpc":"2.0","id":null,"method":"initialize","params":{...}}
```

**Terminal 2 - Send message (replace SESSION_ID):**
```bash
# List tools
curl -X POST "http://localhost:3030/messages?sessionId=SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'

# Call tool
curl -X POST "http://localhost:3030/messages?sessionId=SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_security_best_practices",
      "arguments": {}
    }
  }'
```

### Using JavaScript/TypeScript Client

```typescript
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function connectToGemSec() {
  const transport = new SSEClientTransport(
    new URL("http://localhost:3030/sse")
  );
  
  // Connect and use transport to communicate with server
  // ... implement client logic
}
```

## Deployment

### Docker

```bash
# Build image
docker build -t gemsec-mcp .

# Run container
docker run -p 3030:3030 gemsec-mcp
```

### Environment Variables

- `PORT` - Port for HTTP server (default: 3030)

### Production Considerations

1. **Session Affinity**: If using multiple replicas, ensure session affinity is enabled so `/messages` requests always reach the pod that owns the `/sse` stream.

2. **CORS**: If you need browser access, add CORS headers in `httpServer.ts`:
   ```typescript
   app.use((req, res, next) => {
     res.header('Access-Control-Allow-Origin', '*');
     res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
     res.header('Access-Control-Allow-Headers', 'Content-Type');
     next();
   });
   ```

3. **Timeouts**: SSE connections can last a long time. Ensure proxy/load balancer doesn't timeout too quickly.

4. **Logging**: Monitor connection drops and error handling for debugging.

## Troubleshooting

### Server won't start
- Ensure port is not in use: `lsof -i :3030`
- Check logs for error messages

### Error: "Request timed out" (-32001)
This is a common issue when SSE connection is not established correctly.

**Causes:**
1. Server doesn't respond correctly after SSE connection is created
2. SSE headers are not set correctly
3. Client timeout is too short

**Solutions:**
1. **Ensure server is built with the latest version:**
   ```bash
   npm run build
   ```

2. **Restart server:**
   ```bash
   npm start
   ```

3. **Verify SSE endpoint:**
   ```bash
   # Test SSE endpoint (should stay open, not return immediately)
   curl -N http://localhost:3030/sse
   ```
   If it returns immediately without event stream, there's an implementation issue.

4. **Check server logs:**
   - Ensure there's a log: `SSE session established: <sessionId>`
   - If not, `server.connect()` failed

5. **Ensure CORS is not blocking (if from browser):**
   - Check browser console for CORS errors
   - Ensure CORS headers are set on server

### SSE connection dropped
- Check network stability
- Verify sessionId is still valid
- Check server logs for errors
- Ensure proxy/load balancer doesn't timeout too quickly

### Messages not received
- Ensure sessionId is correct
- Verify request format is JSON-RPC 2.0
- Check Content-Type header: `application/json`
- Ensure session is still active (check with `/healthz` or server logs)

### "Unknown SSE session" error
- Session may have expired or been disconnected
- Ensure sessionId is taken from response headers when connecting to `/sse`
- Check server logs for available sessions

### Tools not appearing / need to re-enable
If tools don't appear when you enable the server, or you need to re-enable multiple times:

**Recent improvements:**
- Connection timeout protection (10s for connection, 30s for messages)
- Better error handling and automatic session cleanup
- Server initialization verification before connection
- Improved logging for debugging

**Troubleshooting steps:**
1. **Check server logs** for initialization messages:
   ```
   GemSec server initialized with tools: analyze_file, analyze_directory, get_security_best_practices
   SSE session established: <sessionId>
   ```

2. **Verify server is running**:
   ```bash
   curl http://localhost:3030/healthz
   ```
   Should return status "ok" with activeSessions count.

3. **Check for connection errors** in server logs - any errors during connection setup will be logged.

4. **Restart the server** if issues persist:
   ```bash
   npm run build
   npm start
   ```

5. **Clear and reconnect** - Disable the MCP server in your IDE, wait a few seconds, then re-enable it.

**If problems persist:**
- Check that the server process is not being killed or restarted
- Verify network connectivity between client and server
- Check for firewall or proxy issues
- Review server logs for any recurring errors

## StdIO vs SSE Comparison

| Feature | StdIO | SSE |
|---------|-------|-----|
| Transport | Process stdio | HTTP/SSE |
| Use Case | Local IDE (Cursor) | Web clients, Remote |
| Setup | Simple (config file) | Requires HTTP server |
| Scalability | Single client | Multiple clients |
| Deployment | Local/CLI | Docker/Cloud |

For use with Cursor, **StdIO transport is recommended** as it's simpler and directly integrated.

