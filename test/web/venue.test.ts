import { describe, expect, it } from 'vitest';
import { autofillVenueRatings, buildVenueMaps, coreQueryHint } from '../../src/web/lib/venue';
import { entry } from './helpers';

describe('venue', () => {
  it('buildVenueMaps prefers later ids', () => {
    const m = buildVenueMaps([
      entry({ id: 2, journal: 'IEEE Access', impactFactor: '3.9' }),
      entry({ id: 1, journal: 'ieee  access', impactFactor: '3.4' }),
      entry({ id: 3, conference: 'IMC', core: 'A' }),
    ]);
    expect(m.journalIf['ieee access']).toBe('3.9');
    expect(m.confCore['imc']).toBe('A');
  });
  it('autofillVenueRatings fills only blanks', () => {
    const maps = { journalIf: { 'ieee access': '3.9' }, confCore: { imc: 'A' } };
    expect(autofillVenueRatings({ journal: 'IEEE Access', conference: 'IMC', impactFactor: '', core: 'B' }, maps))
      .toEqual({ impactFactor: '3.9', core: 'B', filled: ['IF 3.9'] });
  });
  it('coreQueryHint', () => {
    expect(coreQueryHint('ACM Internet Measurement Conference (IMC 2024)')).toBe('IMC');
    expect(coreQueryHint('2024 IEEE Something - Workshop')).toBe('IEEE Something Workshop');
  });
});
