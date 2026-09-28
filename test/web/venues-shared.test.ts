import { describe, expect, it } from 'vitest';
import {
  daysUntil, dueInstant, editionTitle, estimateNext, hasTime, isDueLocal, isIsoDate, nextYearUrls, parseDateRange, shiftYears,
  tzOffsetMinutes, upcomingDeadlines, type Venue, type VenueDeadline, type VenueEdition,
} from '../../src/shared/venues';

const deadline = (over: Partial<VenueDeadline> = {}): VenueDeadline => ({
  id: 1, kind: 'paper', label: '', dueLocal: '2026-05-15 23:59', timezone: 'AoE', estimated: false, source: 'manual', ...over,
});
const edition = (over: Partial<VenueEdition> = {}): VenueEdition => ({
  id: 1, year: 2026, label: '', siteUrl: '', place: '', dateText: '', startDate: '', endDate: '', estimated: false, source: 'manual', note: '',
  deadlines: [], ...over,
});
const venue = (over: Partial<Venue> = {}): Venue => ({
  id: 1, kind: 'conference', acronym: 'IMC', name: 'Internet Measurement Conference', org: 'ACM', field: '', core: 'A', impactFactor: '',
  siteUrl: '', issn: '', reviewTime: '', submitUrl: '', note: '', source: 'manual', sourceKey: '', archived: false, editions: [], ...over,
});

describe('tzOffsetMinutes', () => {
  it('reads the notations used by conferences', () => {
    expect(tzOffsetMinutes('AoE')).toBe(-720);
    expect(tzOffsetMinutes('aoe')).toBe(-720);
    expect(tzOffsetMinutes('UTC')).toBe(0);
    expect(tzOffsetMinutes('UTC-12')).toBe(-720);
    expect(tzOffsetMinutes('UTC+8')).toBe(480);
    expect(tzOffsetMinutes('UTC-5')).toBe(-300);
    expect(tzOffsetMinutes('UTC+5:30')).toBe(330);
    expect(tzOffsetMinutes('UTC+0530')).toBe(330);
    expect(tzOffsetMinutes('GMT+1')).toBe(60);
    expect(tzOffsetMinutes('JST')).toBe(540);
  });
  it('returns null for what it cannot read', () => {
    for (const tz of ['', 'PST', 'UTC+15', 'UTC+5:75', 'Pacific Time', 'UTC+']) expect(tzOffsetMinutes(tz), tz).toBeNull();
  });
});

describe('dueInstant', () => {
  it('converts a local deadline to the instant it ends', () => {
    expect(dueInstant('2026-05-15 23:59', 'AoE')!.toISOString()).toBe('2026-05-16T11:59:00.000Z');
    expect(dueInstant('2026-05-15 23:59:59', 'UTC')!.toISOString()).toBe('2026-05-15T23:59:59.000Z');
    expect(dueInstant('2026-05-15 17:00', 'UTC+8')!.toISOString()).toBe('2026-05-15T09:00:00.000Z');
    expect(dueInstant('2026-05-15T08:00', 'JST')!.toISOString()).toBe('2026-05-14T23:00:00.000Z');
  });
  it('treats a date without a time as the end of that day', () => {
    expect(dueInstant('2026-05-15', 'UTC')!.toISOString()).toBe('2026-05-15T23:59:59.000Z');
    expect(dueInstant('2026-05-15', 'AoE')!.toISOString()).toBe('2026-05-16T11:59:59.000Z');
    expect(hasTime('2026-05-15')).toBe(false);
    expect(hasTime('2026-05-15 09:00')).toBe(true);
  });
  it('falls back to AoE for an unknown time zone, the latest possible reading', () => {
    expect(dueInstant('2026-05-15 23:59', 'PST')!.toISOString()).toBe('2026-05-16T11:59:00.000Z');
  });
  it('rejects impossible dates', () => {
    for (const s of ['', '2026-02-30', '2026-13-01', '2026-00-10', '2026-05-15 24:00', '2026-05-15 10:60', '26-05-15', '2026/05/15', 'tomorrow']) {
      expect(isDueLocal(s), s).toBe(false);
      expect(dueInstant(s, 'UTC'), s).toBeNull();
    }
    expect(isDueLocal('2028-02-29')).toBe(true);
    expect(isDueLocal('2027-02-29')).toBe(false);
    expect(isIsoDate('2026-05-15')).toBe(true);
    expect(isIsoDate('2026-05-15 10:00')).toBe(false);
  });
});

describe('shiftYears', () => {
  it('keeps the month, day and time', () => {
    expect(shiftYears('2026-05-15 23:59', 1)).toBe('2027-05-15 23:59');
    expect(shiftYears('2026-11-20', 1)).toBe('2027-11-20');
    expect(shiftYears('2026-05-15 23:59:59', 2)).toBe('2028-05-15 23:59:59');
  });
  it('moves February 29 to February 28 outside leap years', () => {
    expect(shiftYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(shiftYears('2024-02-29 12:00', 4)).toBe('2028-02-29 12:00');
  });
  it('leaves unreadable input alone', () => {
    expect(shiftYears('soon', 1)).toBe('soon');
  });
});

describe('parseDateRange', () => {
  it('reads the notations found in the public data', () => {
    expect(parseDateRange('Oct 12-16, 2026')).toEqual({ start: '2026-10-12', end: '2026-10-16' });
    expect(parseDateRange('November 2-4, 2021')).toEqual({ start: '2021-11-02', end: '2021-11-04' });
    expect(parseDateRange('Nov 4-6, 2024')).toEqual({ start: '2024-11-04', end: '2024-11-06' });
    expect(parseDateRange('June 30 - July 2, 2025')).toEqual({ start: '2025-06-30', end: '2025-07-02' });
    expect(parseDateRange('Sept. 8–12, 2025')).toEqual({ start: '2025-09-08', end: '2025-09-12' });
    expect(parseDateRange('May 5, 2025')).toEqual({ start: '2025-05-05', end: '2025-05-05' });
    expect(parseDateRange('12-16 October 2026')).toEqual({ start: '2026-10-12', end: '2026-10-16' });
    expect(parseDateRange('August 12th-14th, 2026')).toEqual({ start: '2026-08-12', end: '2026-08-14' });
  });
  it('handles a range across the new year and a missing year', () => {
    expect(parseDateRange('Dec 30 - Jan 2, 2026')).toEqual({ start: '2025-12-30', end: '2026-01-02' });
    expect(parseDateRange('Dec 30 - Jan 2', 2027)).toEqual({ start: '2027-12-30', end: '2028-01-02' });
    expect(parseDateRange('Oct 12-16', 2026)).toEqual({ start: '2026-10-12', end: '2026-10-16' });
    expect(parseDateRange('Oct 12-16')).toBeNull();
  });
  it('returns null instead of guessing', () => {
    for (const s of ['', 'TBD', 'Virtual', 'Fall 2026', 'Oct 32, 2026', 'Foo 1-2, 2026', 'Oct 16-12, 2026', '2026']) {
      expect(parseDateRange(s), s).toBeNull();
    }
  });
});

describe('nextYearUrls', () => {
  it('replaces a four-digit year wherever it appears', () => {
    expect(nextYearUrls('https://conferences.sigcomm.org/imc/2026/', 2026, 2027)).toEqual(['https://conferences.sigcomm.org/imc/2027/']);
    expect(nextYearUrls('https://sp2026.ieee-security.org/cfp.html', 2026, 2027)).toEqual(['https://sp2027.ieee-security.org/cfp.html']);
    expect(nextYearUrls('https://infocom2026.ieee-infocom.org/2026/cfp', 2026, 2027)).toEqual(['https://infocom2027.ieee-infocom.org/2027/cfp']);
  });
  it('replaces a two-digit year that follows a name', () => {
    expect(nextYearUrls('https://www.usenix.org/conference/nsdi26', 2026, 2027)).toEqual(['https://www.usenix.org/conference/nsdi27']);
    expect(nextYearUrls('https://www.usenix.org/conference/usenixsecurity26/call-for-papers', 2026, 2027))
      .toEqual(['https://www.usenix.org/conference/usenixsecurity27/call-for-papers']);
    expect(nextYearUrls('https://pam26.example.org/', 2026, 2027)).toContain('https://pam27.example.org/');
  });
  it('does not touch other numbers', () => {
    expect(nextYearUrls('https://example.org:8026/conf/126/page26x', 2026, 2027)).toEqual(['https://example.org:8026/conf/126/page27x']);
    expect(nextYearUrls('https://example.org/v126/', 2026, 2027)).toEqual([]);
  });
  it('returns nothing without a year or for a non-web address', () => {
    expect(nextYearUrls('https://www.ndss-symposium.org/', 2026, 2027)).toEqual([]);
    expect(nextYearUrls('', 2026, 2027)).toEqual([]);
    expect(nextYearUrls('javascript:alert(2026)', 2026, 2027)).toEqual([]);
    expect(nextYearUrls('ftp://example.org/2026', 2026, 2027)).toEqual([]);
  });
});

describe('estimateNext', () => {
  it('shifts every date by a year and marks everything as estimated', () => {
    const prev = edition({
      year: 2026, siteUrl: 'https://x/2026/', place: 'Madrid', dateText: 'Oct 12-16, 2026', startDate: '2026-10-12', endDate: '2026-10-16',
      source: 'ccfddl', note: 'n',
      deadlines: [deadline({ label: 'Cycle 1', dueLocal: '2025-11-20 23:59', source: 'ccfddl' }), deadline({ id: 2, kind: 'abstract', dueLocal: '2026-04-22' })],
    });
    expect(estimateNext(prev, 2027)).toEqual({
      year: 2027, label: '', siteUrl: '', place: '', dateText: '', startDate: '2027-10-12', endDate: '2027-10-16',
      estimated: true, source: 'estimate', note: '',
      deadlines: [
        { kind: 'paper', label: 'Cycle 1', dueLocal: '2026-11-20 23:59', timezone: 'AoE', estimated: true, source: 'estimate' },
        { kind: 'abstract', label: '', dueLocal: '2027-04-22', timezone: 'AoE', estimated: true, source: 'estimate' },
      ],
    });
  });
  it('can skip a year', () => {
    expect(estimateNext(edition({ year: 2024, startDate: '2024-06-01', endDate: '' }), 2026)).toMatchObject({ year: 2026, startDate: '2026-06-01', endDate: '' });
  });
});

describe('upcomingDeadlines', () => {
  const now = new Date('2026-05-01T00:00:00Z');
  const v = venue({ editions: [edition({ deadlines: [
    deadline({ id: 1, dueLocal: '2026-04-30 23:59', timezone: 'UTC' }),
    deadline({ id: 2, dueLocal: '2026-05-15 23:59' }),
    deadline({ id: 3, kind: 'abstract', dueLocal: '2026-05-08' }),
    deadline({ id: 4, dueLocal: 'unknown' }),
  ] })] });
  it('lists future deadlines, nearest first', () => {
    expect(upcomingDeadlines([v], now).map((u) => u.deadline.id)).toEqual([3, 2]);
  });
  it('keeps a deadline that is still open somewhere on Earth', () => {
    const open = venue({ editions: [edition({ deadlines: [deadline({ dueLocal: '2026-04-30 23:59', timezone: 'AoE' })] })] });
    expect(upcomingDeadlines([open], now)).toHaveLength(1);
  });
  it('leaves out archived venues', () => {
    expect(upcomingDeadlines([{ ...v, archived: true }], now)).toEqual([]);
  });
  it('counts the days left, rounding up', () => {
    expect(daysUntil(new Date('2026-05-01T00:00:01Z'), now)).toBe(1);
    expect(daysUntil(new Date('2026-05-03T00:00:00Z'), now)).toBe(2);
    expect(daysUntil(new Date('2026-04-30T12:00:00Z'), now)).toBe(0);
    expect(daysUntil(new Date('2026-04-29T00:00:00Z'), now)).toBe(-2);
  });
});

describe('titles', () => {
  it('prefers the acronym', () => {
    expect(editionTitle({ acronym: 'IMC', name: 'Long name' }, { year: 2026, label: '' })).toBe('IMC 2026');
    expect(editionTitle({ acronym: ' ', name: 'Computer Networks' }, { year: 2026, label: 'Special Issue on IPv6' })).toBe('Computer Networks 2026 Special Issue on IPv6');
  });
});
