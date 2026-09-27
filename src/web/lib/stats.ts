import type { Entry } from '../../shared/types';

export interface Stats {
  total: number;
  byRead: Record<string, number>;
  years: [string, number][];
  byCore: [string, number][];
  topTags: [string, number][];
  topVenues: [string, number][];
}

const count = (items: string[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const k of items) m[k] = (m[k] || 0) + 1;
  return m;
};
const desc = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);

export function computeStats(all: Entry[]): Stats {
  const byRead: Record<string, number> = { 未読: 0, 斜め読み: 0, 精読済: 0 };
  for (const e of all) byRead[e.read || '未読'] = (byRead[e.read || '未読'] || 0) + 1;
  const years = Object.entries(count(all.map((e) => e.year.trim()).filter((y) => /^\d{4}$/.test(y)))).sort();
  const byCore = Object.entries(count(all.map((e) => e.core.trim()).filter(Boolean))).sort();
  const topTags = desc(count(all.flatMap((e) => e.tags))).slice(0, 12);
  const topVenues = desc(count(all.map((e) => e.journal || e.conference).filter(Boolean))).slice(0, 10);
  return { total: all.length, byRead, years, byCore, topTags, topVenues };
}
