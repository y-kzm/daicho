import { describe, expect, it } from 'vitest';
import { paletteItemKey, scoreMatch, searchPalette, type PaletteItem } from '../../src/web/lib/palette';
import { appData, entry, project } from './helpers';

describe('scoreMatch', () => {
  it('prefix 3 > word start 2 > substring 1 > none 0', () => {
    expect(scoreMatch('ipv', 'IPv6 Neighbor Discovery')).toBe(3);
    expect(scoreMatch('neigh', 'IPv6 Neighbor Discovery')).toBe(2);
    expect(scoreMatch('ghbor', 'IPv6 Neighbor Discovery')).toBe(1);
    expect(scoreMatch('dns', 'IPv6 Neighbor Discovery')).toBe(0);
    expect(scoreMatch('  ', 'anything')).toBe(0);
  });
  it('treats punctuation as a word boundary', () => {
    expect(scoreMatch('disc', 'ipv6-discovery')).toBe(2);
  });
});

describe('searchPalette', () => {
  const data = appData(
    [
      entry({ id: 1, title: 'IPv6 Neighbor Discovery', bibkey: 'narten2007', year: '2007', conference: 'RFC' }),
      entry({ id: 2, title: 'Measuring DNS', bibkey: 'dns2019', tags: ['DNS'] }),
    ],
    { tags: ['DNS', 'IPv6'], projects: [project({ id: 7, name: 'DNS 論文' })] },
  );
  const commands: PaletteItem[] = [
    { kind: 'command', id: 'stats', label: '統計を開く' },
    { kind: 'command', id: 'add', label: '論文を追加' },
  ];
  it('returns the commands for an empty query', () => {
    expect(searchPalette('', data, commands)).toEqual(commands);
  });
  it('ranks by score, then kind', () => {
    expect(searchPalette('dns', data, commands).map(paletteItemKey)).toEqual(['project:7', 'tag:DNS', 'entry:2']);
  });
  it('matches entries by bibkey and builds the sub line', () => {
    expect(searchPalette('narten', data, commands)).toEqual([{ kind: 'entry', id: 1, title: 'IPv6 Neighbor Discovery', sub: '2007 · RFC · narten2007' }]);
  });
  it('finds commands by label and respects the limit', () => {
    expect(searchPalette('統計', data, commands)).toEqual([commands[0]]);
    expect(searchPalette('d', data, commands, 2).map(paletteItemKey)).toEqual(['project:7', 'tag:DNS']);
  });
});
