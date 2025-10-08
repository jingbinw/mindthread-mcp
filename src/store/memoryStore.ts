import { RawNotionNote } from '../notion/loader.js';
import { embedText, extractEmotion, extractThemeKeywords } from '../analysis/nlp.js';

export interface StoredNote extends RawNotionNote {
  vector: number[];
  theme_keywords: string[];
  emotion: string;
  created_ts: number;
}

export class MemoryStore {
  private notes: StoredNote[] = [];
  private byId: Map<string, StoredNote> = new Map();

  load(raw: RawNotionNote[]) {
    this.notes = raw.map(r => {
      const text = r.title + '\n' + r.content;
      const vec = embedText(text);
      const theme_keywords = extractThemeKeywords(text, 6);
      const emotion = extractEmotion(r.content, r.emotion_hint);
      return {
        ...r,
        vector: vec,
        theme_keywords,
        emotion,
        created_ts: new Date(r.created_time).getTime()
      } as StoredNote;
    });
    this.byId = new Map(this.notes.map(n => [n.id, n]));
  }

  all(): StoredNote[] { return this.notes; }
  get(id: string): StoredNote | undefined { return this.byId.get(id); }
}

// (Removed local tokenize; rely on nlp.embedText internal normalization)

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
