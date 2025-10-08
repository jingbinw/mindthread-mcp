# MindThread MCP Server

Semantic time-travel for idea evolution context.

This project implements a Model Context Protocol (MCP) server. On startup it:
1. Loads Notion notes automatically if environment variables are set, otherwise falls back to mock data
2. Builds an in-memory vector / keyword index
3. Exposes three tools:
   - `capture_idea` Analyze a new idea (theme keywords + emotion + normalized structure)
   - `find_related_thoughts` Retrieve historically related thoughts (semantic + temporal + thematic)
   - `timeline_reconnect` Generate an evolution timeline for a topic / idea

## Highlights
- Lightweight: no external model dependency (simple hashing + tf weighting + cosine similarity)
- Theme aggregation + coarse emotion classification (positive / neutral / negative)
- Timeline scoring blends semantic similarity + temporal spread + continuity bonus

## Quick Start

### 1. Install dependencies
```bash
npm install
npm run build
```

### 2. Start the server (standalone debug)
```bash
npm start
```
Runs over STDIO (MCP compliant).

Note: Currently using internal SDK path `server/index.js` and the `Server` class. If the SDK export map changes, inspect `node_modules/@modelcontextprotocol/sdk/dist/server/index.js`.

### 3. Configure Claude Desktop (example)
Add to `claude_desktop_config.json`:
```jsonc
{
  "mcpServers": {
    "mindthread": {
      "command": "node",
      "args": ["/absolute/path/to/mindthread-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```
Restart Claude Desktop to auto-discover the server.

### 3.1 Alternative: use provided config template
This repository includes `claude_mcp.config.example.json`. Copy or merge its `mcpServers` section into your Claude Desktop config file. On macOS (default install) the file usually lives at:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Steps:
1. Open the existing config (create it if it doesn’t exist).
2. Paste the `mindthread` block from the example file.
3. Replace `/ABSOLUTE/PATH/TO/mindthread-mcp/dist/index.js` with your actual build path.
4. (Optional) Put your Notion credentials under `env` or remove them to rely on `.env`.
5. Restart Claude Desktop.

Security tip: Prefer setting secrets in the Claude config `env` block or in your shell rather than committing a real `.env` to version control.

### 4. Tool invocation examples (pseudo JSON-RPC)
Capture a new idea:
```json
{
  "method": "tools/call",
  "params": {
    "name": "capture_idea",
    "arguments": {"text": "I feel my recent knowledge notes are too fragmented; need a temporal context view."}
  }
}
```

Find related thoughts:
```json
{
  "method": "tools/call",
  "params": {
    "name": "find_related_thoughts",
    "arguments": {"query": "temporal context fragmented knowledge"}
  }
}
```

Generate timeline for a topic:
```json
{
  "method": "tools/call",
  "params": {
    "name": "timeline_reconnect",
    "arguments": {"topic": "knowledge management"}
  }
}
```

## Data Loading (Notion + Mock)
At startup the server attempts to load real Notion data:

Environment variables:
```
NOTION_API_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
Behavior:
- If both vars are present, it queries the Notion database (simple pagination, title + tags only).
- On any failure (network/auth/empty), it logs a warning and falls back to mock data.
- If vars are absent, it directly loads `data/notion_mock.json`.

Mock dataset lives in `data/notion_mock.json` and can be freely edited for local experiments.

### Using a .env file
You can place variables in a local `.env` . They will be loaded automatically at startup and will not override already-exported environment variables.

## Project Structure
```
src/
  index.ts              # MCP entry
  analysis/nlp.ts       # Theme / emotion / embedding
  store/memoryStore.ts  # In-memory data & index
  notion/loader.ts      # Mock / future Notion adapter
  tools/ideas.ts        # Tool implementations
```

