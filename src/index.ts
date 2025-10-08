// Import directly from dist because package lacks export map for subpath in ESM mode
// Attempt to import Server; if not available at runtime, we'll dynamically require
import * as serverIndex from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { autoLoadNotes } from './notion/loader.js';
import { MemoryStore } from './store/memoryStore.js';
import { IdeaTools } from './tools/ideas.js';
import { loadEnvFile } from './config/env.js';

async function bootstrap() {
  // Load .env early (won't override existing env vars)
  loadEnvFile();
  const ServerCtor: any = (serverIndex as any).Server;
  if (!ServerCtor) {
    throw new Error('Server class not found in SDK');
  }
  const server = new ServerCtor({ name: 'mindthread-mcp', version: '0.1.0' }, { capabilities: { tools: true, logging: false } });

  const store = new MemoryStore();
  const { source, notes } = await autoLoadNotes();
  store.load(notes);
  console.error(`[mindthread] loaded ${notes.length} notes from ${source}`);
  const tools = new IdeaTools(store);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'capture_idea', description: 'Analyze a raw idea text: theme keywords, emotion, embedding meta.' },
      { name: 'find_related_thoughts', description: 'Retrieve related historical notes by semantic similarity.' },
      { name: 'timeline_reconnect', description: 'Produce an evolution timeline for a topic / idea.' }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case 'capture_idea': {
          const res = tools.captureIdea({ text: String((args as any)?.text || '') });
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
        }
        case 'find_related_thoughts': {
          const { query, note_id, limit } = (args as any) || {};
          const res = tools.findRelated({ query, note_id, limit });
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
        }
        case 'timeline_reconnect': {
          const { topic, note_id, query, max_points } = (args as any) || {};
          const res = tools.timeline({ topic, note_id, query, max_points });
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

bootstrap().catch(err => {
  console.error('Fatal error starting MindThread MCP server', err);
  process.exit(1);
});
