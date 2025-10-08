import fs from 'fs';
import path from 'path';
import https from 'https';

export interface RawNotionNote {
  id: string;
  title: string;
  content: string;
  created_time: string; // ISO
  tags?: string[];
  emotion_hint?: string; // optional manual hint
}

export async function loadMockNotionNotes(dataDir?: string): Promise<RawNotionNote[]> {
  const base = dataDir || path.join(process.cwd(), 'data');
  const file = path.join(base, 'notion_mock.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Mock data file not found at ${file}`);
  }
  const raw = await fs.promises.readFile(file, 'utf-8');
  const parsed = JSON.parse(raw) as RawNotionNote[];
  return parsed.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());
}

// Configuration shape for querying a Notion database (used by loadFromNotionApi)
export interface NotionAPIConfig {
  authToken: string;
  databaseId: string;
}

export async function loadFromNotionApi(cfg: NotionAPIConfig): Promise<RawNotionNote[]> {
  const pages: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;
  while (hasMore) {
    const body = JSON.stringify({
      page_size: 50,
      start_cursor: startCursor,
      sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }]
    });
    const resp = await notionPost(`/v1/databases/${cfg.databaseId}/query`, cfg.authToken, body);
    pages.push(...(resp.results || []));
    hasMore = resp.has_more;
    startCursor = resp.next_cursor || undefined;
  }

  const notes: RawNotionNote[] = pages.map(p => mapNotionPage(p)).filter(Boolean) as RawNotionNote[];
  // Fetch blocks (content) sequentially to stay simple / avoid rate bursts
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const note = notes[i];
    if (!note) continue;
    try {
      const blocks = await fetchPageBlocks(page.id, cfg.authToken, 3_000); // cap ~3k chars
      if (blocks.length > 0) note.content = blocks.join('\n');
    } catch (e) {
      // Keep existing minimal note if block fetch fails
      console.warn('[notion] block fetch failed for page', page.id, (e as Error).message);
    }
  }
  notes.sort((a,b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());
  return notes;
}

function notionPost(pathname: string, token: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'api.notion.com',
      path: pathname,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Notion API error ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function notionGet(pathname: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'GET',
      hostname: 'api.notion.com',
      path: pathname,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Notion API error ${res.statusCode}: ${data}`));
        }
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchPageBlocks(pageId: string, token: string, charCap = 3000): Promise<string[]> {
  const id = pageId.replace(/-/g,'');
  let cursor: string | undefined = undefined;
  const lines: string[] = [];
  let keepFetching = true;
  while (keepFetching) {
    const qp = cursor ? `?start_cursor=${cursor}` : '';
    const resp = await notionGet(`/v1/blocks/${id}/children${qp}`, token);
    for (const block of resp.results || []) {
      const text = extractBlockPlain(block);
      if (text) {
        lines.push(text);
        if (lines.join('\n').length >= charCap) {
          keepFetching = false; break;
        }
      }
    }
    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }
  return lines;
}

function extractBlockPlain(block: any): string | null {
  const type = block.type;
  if (!type) return null;
  const data = block[type];
  if (!data) return null;
  const rich = data.rich_text || data.title || [];
  if (!Array.isArray(rich)) return null;
  const text = richTextToPlain(rich).trim();
  if (!text) return null;
  switch (type) {
    case 'heading_1': return '# ' + text;
    case 'heading_2': return '## ' + text;
    case 'heading_3': return '### ' + text;
    case 'bulleted_list_item': return '- ' + text;
    case 'numbered_list_item': return '1. ' + text; // numbering simplified
    case 'to_do': return (data.checked ? '[x] ' : '[ ] ') + text;
    case 'quote': return '> ' + text;
    case 'callout': return text;
    case 'paragraph': return text;
    case 'code': return '```\n' + text + '\n```';
    default: return text; // fallback
  }
}

function richTextToPlain(r: any[]): string {
  return r.map(x => x.plain_text || '').join(' ');
}

function mapNotionPage(page: any): RawNotionNote | null {
  try {
    const props = page.properties || {};
    const titleProp = Object.values(props).find((p: any) => p?.type === 'title');
  const titleArray = (titleProp as any)?.title || [];
  const title = richTextToPlain(Array.isArray(titleArray) ? titleArray : [] ) || 'Untitled';
  const contentBlocks: string[] = []; // will be filled by block fetch
    const created = page.created_time || page.last_edited_time || new Date().toISOString();
    // Tags: find a multi_select or select property
    let tags: string[] = [];    
    const tagProp = Object.values(props).find((p: any) => p?.type === 'multi_select');
    if (tagProp && Array.isArray((tagProp as any).multi_select)) {
      tags = (tagProp as any).multi_select.map((t: any) => t?.name).filter(Boolean);
    }
    return {
      id: page.id,
      title,
      content: contentBlocks.join('\n'),
      created_time: created,
      tags
    };
  } catch {
    return null;
  }
}

export async function autoLoadNotes(): Promise<{ source: string; notes: RawNotionNote[] }> {
  const token = process.env.NOTION_API_TOKEN;
  const db = process.env.NOTION_DATABASE_ID;
  if (token && db) {
    try {
      const notes = await loadFromNotionApi({ authToken: token, databaseId: db });
      if (notes.length > 0) return { source: 'notion', notes };
    } catch (e) {
      console.warn('[notion] falling back to mock:', (e as Error).message);
    }
  }
  const notes = await loadMockNotionNotes();
  return { source: 'mock', notes };
}
