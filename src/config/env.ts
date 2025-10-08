import fs from 'fs';
import path from 'path';

/**
 * Minimal .env loader (no external dependency). Will not override existing process.env keys.
 * Lines beginning with # are ignored. Supports KEY=VALUE with optional quotes.
 */
export function loadEnvFile(filename = '.env'): void {
  try {
    const file = path.join(process.cwd(), filename);
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().length === 0) continue;
      if (line.trim().startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      if (process.env[key] !== undefined) continue; // do not override existing env
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (e) {
    // Silent fail to keep startup resilient
    console.warn('[env] failed to load .env:', (e as Error).message);
  }
}
