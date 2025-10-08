import { v4 as uuidv4 } from 'uuid';
import { MemoryStore, cosineSimilarity, StoredNote } from '../store/memoryStore.js';
import { analyzeIdea } from '../analysis/nlp.js';

export interface CaptureIdeaArgs { text: string; }
export interface FindRelatedArgs { query?: string; note_id?: string; limit?: number; }
export interface TimelineArgs { topic?: string; note_id?: string; query?: string; max_points?: number; }

export class IdeaTools {
  constructor(private store: MemoryStore) {}

  captureIdea(args: CaptureIdeaArgs) {
    if (!args.text || args.text.trim().length < 3) {
      throw new Error('text is required and should be meaningful');
    }
    const base = analyzeIdea(args.text);
    const id = 'idea_' + uuidv4();
    return { id, ...base };
  }

  findRelated(args: FindRelatedArgs) {
    const limit = args.limit ?? 6;
    let vector: number[] | undefined;
    let sourceText = '';
    if (args.note_id) {
      const note = this.store.get(args.note_id);
      if (!note) throw new Error('note_id not found');
      vector = note.vector;
      sourceText = note.content;
    } else if (args.query) {
      const analyzed = analyzeIdea(args.query);
      vector = analyzed.vector;
      sourceText = args.query;
    } else {
      throw new Error('Either query or note_id required');
    }

    const scored = this.store.all().map(n => ({
      note: n,
      score: cosineSimilarity(vector!, n.vector)
    }));

    scored.sort((a,b) => b.score - a.score);
    const results = scored.slice(0, limit).map(s => simplifyNote(s.note, s.score));
    return { query: sourceText, results };
  }

  timeline(args: TimelineArgs) {
    // Build vector either from topic, query or note_id
    let vector: number[] | undefined;
    let label = '';
    if (args.note_id) {
      const n = this.store.get(args.note_id);
      if (!n) throw new Error('note_id not found');
      vector = n.vector; label = `note:${n.id}`;
    } else if (args.topic) {
      const analyzed = analyzeIdea(args.topic);
      vector = analyzed.vector; label = `topic:${args.topic}`;
    } else if (args.query) {
      const analyzed = analyzeIdea(args.query);
      vector = analyzed.vector; label = `query:${args.query}`;
    } else {
      throw new Error('Provide topic, query or note_id');
    }

    const notes = this.store.all();
    // Score notes by semantic similarity * temporal spread factor
    const minTs = notes[0]?.created_ts ?? 0;
    const maxTs = notes[notes.length-1]?.created_ts ?? 1;
    const totalSpan = maxTs - minTs || 1;

    const enriched = notes.map(n => {
      const sim = cosineSimilarity(vector!, n.vector);
      const pos = (n.created_ts - minTs) / totalSpan; // 0..1
      const temporalDiversity = 0.6 + 0.4 * Math.abs(0.5 - pos); // encourage spread across timeline
      const continuityBonus = continuityFactor(n, notes);
      const score = sim * 0.55 + temporalDiversity * 0.25 + continuityBonus * 0.20;
      return { n, sim, temporalDiversity, continuityBonus, score };
    });

    enriched.sort((a,b) => b.score - a.score);
    const maxPoints = args.max_points ?? 7;

    // Greedy pick ensuring temporal coverage
    const picked: typeof enriched = [];
    const usedWindows: number[] = [];
    const segments = 5; // temporal segmentation
    for (const e of enriched) {
      const segment = Math.floor(((e.n.created_ts - minTs) / totalSpan) * segments);
      if (usedWindows.filter(s => s === segment).length > 1) continue; // limit per segment
      picked.push(e);
      usedWindows.push(segment);
      if (picked.length >= maxPoints) break;
    }

    picked.sort((a,b) => a.n.created_ts - b.n.created_ts);

    return {
      target: label,
      points: picked.map(p => ({
        id: p.n.id,
        title: p.n.title,
        created_time: p.n.created_time,
        emotion: p.n.emotion,
        theme_keywords: p.n.theme_keywords.slice(0,4),
        score: round(p.score),
        sim: round(p.sim),
        continuity: round(p.continuityBonus),
        temporal: round(p.temporalDiversity),
        summary_hint: summarize(p.n)
      })),
      meta: { total_candidates: notes.length }
    };
  }
}

function round(n: number) { return Math.round(n * 1000)/1000; }

function continuityFactor(n: StoredNote, notes: StoredNote[]): number {
  // reward if neighbors share theme keywords or emotion
  const idx = notes.findIndex(x => x.id === n.id);
  if (idx === -1) return 0.5;
  const neighbors = [notes[idx-1], notes[idx+1]].filter(Boolean) as StoredNote[];
  let score = 0;
  for (const neigh of neighbors) {
    const overlap = intersection(n.theme_keywords, neigh.theme_keywords).length;
    if (overlap > 0) score += 0.3 + 0.1 * overlap;
    if (neigh.emotion === n.emotion) score += 0.1;
  }
  return Math.min(1, 0.3 + score);
}

function intersection(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter(x => setB.has(x));
}

function simplifyNote(n: StoredNote, score: number) {
  return {
    id: n.id,
    title: n.title,
    created_time: n.created_time,
    emotion: n.emotion,
    score: round(score),
    theme_keywords: n.theme_keywords.slice(0,6)
  };
}

function summarize(n: StoredNote): string {
  // crude summary hint using first sentence or trimmed
  const firstSentence = n.content.split(/。|\.|\n/)[0];
  return firstSentence.length > 80 ? firstSentence.slice(0,77) + '…' : firstSentence;
}
