// Lightweight heuristic-based NLP utilities (English-only, no external deps)

const STOP_WORDS = new Set([
  'the','a','an','to','of','and','for','on','in','is','it','that','this','with','as','by','be','are','was','were','or','from','at','not','have','has','had','can','could','should','would','will','just','into','about'
]);

const NON_WORD_RE = /[^a-z0-9\s]/g;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(NON_WORD_RE, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function extractThemeKeywords(text: string, limit = 5): string[] {
  const freq: Record<string, number> = {};
  for (const tok of tokenize(text)) {
    if (STOP_WORDS.has(tok) || tok.length === 1) continue;
    freq[tok] = (freq[tok] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a,b) => b[1]-a[1])
    .slice(0, limit)
    .map(x => x[0]);
}

const POSITIVE_HINTS = ['success','successful','value','improve','improved','improving','positive','great','better'];
const NEGATIVE_HINTS = ['pain','fail','failure','problem','issue','difficulty','bottleneck','bad','missing','lack','negative'];

export function extractEmotion(text: string, hint?: string): string {
  const lower = text.toLowerCase();
  if (hint) {
    const h = hint.toLowerCase();
    if (h.includes('pos')) return 'positive';
    if (h.includes('neg')) return 'negative';
  }
  if (POSITIVE_HINTS.some(k => lower.includes(k))) return 'positive';
  if (NEGATIVE_HINTS.some(k => lower.includes(k))) return 'negative';
  return 'neutral';
}

// Simple hashing embedding: bag-of-words hashed into fixed length vector
const DIM = 128;
export function embedText(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  for (const tok of tokenize(text)) {
    if (!tok) continue;
    const h = hash32(tok) % DIM;
    vec[h] += 1;
  }
  // l2 normalize
  const norm = Math.sqrt(vec.reduce((s,v) => s + v*v, 0)) || 1;
  return vec.map(v => v / norm);
}

function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i=0;i<str.length;i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface CapturedIdea {
  id: string;
  text: string;
  theme_keywords: string[];
  emotion: string;
  vector: number[];
  created_ts: number;
}

export function analyzeIdea(text: string): Omit<CapturedIdea,'id'> {
  const theme_keywords = extractThemeKeywords(text, 6);
  const emotion = extractEmotion(text);
  const vector = embedText(text);
  return { text, theme_keywords, emotion, vector, created_ts: Date.now() };
}
