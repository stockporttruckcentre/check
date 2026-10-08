import type { CSSProperties } from 'react';

/* The pack's generator functions write inline style strings. Components here keep
   those strings as they are and turn them into React style objects, so a value
   can be checked against the source file by eye. */
const cache = new Map<string, CSSProperties>();

export function css(s: string): CSSProperties {
  const hit = cache.get(s);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    const key = k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = v;
  }
  if (cache.size > 4000) cache.clear();
  cache.set(s, out as CSSProperties);
  return out as CSSProperties;
}
