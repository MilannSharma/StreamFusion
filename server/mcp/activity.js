// Tracks external MCP clients (Claude Code, Claude Desktop, Cursor ...). The MCP server process sends a heartbeat
// while its client is attached and labels every tool call, so the UI can show "MCP connected" and what the AI is doing.
import express from 'express';

const clients = new Map(); // name -> lastSeen
const recent = [];         // last tool calls made through MCP
const ALIVE_MS = 25000;

export function createMcpActivity() {
  const router = express.Router();

  // Mark MCP-originated tool calls (header set by the MCP server) and record them.
  const middleware = (req, res, next) => {
    if (req.headers['x-sf-client'] === 'mcp' && /^\/api\/(device|web)\/tool\//.test(req.originalUrl)) {
      const name = req.originalUrl.split('?')[0].split('/').pop();
      const client = String(req.headers['x-sf-client-name'] || 'MCP client').slice(0, 40);
      clients.set(client, Date.now());
      res.on('finish', () => { recent.push({ t: Date.now(), name, ok: res.statusCode < 400, client }); if (recent.length > 30) recent.shift(); });
    }
    next();
  };

  router.post('/ping', (req, res) => { clients.set(String(req.body?.client || 'MCP client').slice(0, 40), Date.now()); res.json({ success: true }); });
  router.post('/bye', (req, res) => { clients.delete(String(req.body?.client || 'MCP client').slice(0, 40)); res.json({ success: true }); });
  router.get('/status', (req, res) => {
    const now = Date.now();
    const live = [...clients.entries()].filter(([, t]) => now - t < ALIVE_MS).map(([n]) => n);
    res.json({ success: true, connected: live.length > 0, clients: live, recent: recent.slice(-12).reverse() });
  });
  return { router, middleware };
}
