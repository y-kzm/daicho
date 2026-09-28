import { describe, expect, it } from 'vitest';
import { feedUrl } from '../../src/web/venues/api';
import { editionDates, entriesOf, originalWhen, remaining, urgency } from '../../src/web/venues/format';
import { entry } from './helpers';

describe('remaining / urgency', () => {
  it('describes the days left', () => {
    expect([-3, 0, 1, 2, 59, 60, 95].map(remaining)).toEqual(['終了', '今日', '明日', 'あと 2 日', 'あと 59 日', 'あと約 2 か月', 'あと約 3 か月']);
    expect([0, 14, 15, 60, 61].map(urgency)).toEqual(['soon', 'soon', 'near', 'near', 'far']);
  });
});

describe('originalWhen / editionDates', () => {
  it('keeps the notation of the conference site', () => {
    expect(originalWhen({ dueLocal: '2026-05-15 23:59', timezone: 'AoE' })).toBe('2026-05-15 23:59 AoE');
    expect(originalWhen({ dueLocal: '2026-05-15', timezone: 'UTC+9' })).toBe('2026-05-15 (終日) UTC+9');
  });
  it('shortens a range', () => {
    expect(editionDates({ startDate: '2026-10-12', endDate: '2026-10-16', dateText: 'x' })).toBe('2026/10/12 〜 16');
    expect(editionDates({ startDate: '2026-06-30', endDate: '2026-07-02', dateText: '' })).toBe('2026/6/30 〜 7/2');
    expect(editionDates({ startDate: '2026-12-30', endDate: '2027-01-02', dateText: '' })).toBe('2026/12/30 〜 2027/1/2');
    expect(editionDates({ startDate: '2026-05-05', endDate: '2026-05-05', dateText: '' })).toBe('2026/5/5');
    expect(editionDates({ startDate: '', endDate: '', dateText: 'Fall 2026' })).toBe('Fall 2026');
  });
});

describe('entriesOf', () => {
  const es = [
    entry({ id: 1, conference: 'IMC' }), entry({ id: 2, conference: 'ACM IMC 2024' }), entry({ id: 3, conference: 'ACM Internet Measurement Conference' }),
    entry({ id: 4, conference: 'IMCOM' }), entry({ id: 5, journal: 'IEEE/ACM Transactions on Networking' }), entry({ id: 6 }),
  ];
  it('matches the acronym as a word, and the full name', () => {
    expect(entriesOf({ acronym: 'IMC', name: 'ACM Internet Measurement Conference' }, es).map((e) => e.id)).toEqual([1, 2, 3]);
    expect(entriesOf({ acronym: 'ToN', name: 'IEEE/ACM Transactions on Networking' }, es).map((e) => e.id)).toEqual([5]);
  });
  it('does not match inside a longer word, also when only the acronym is known', () => {
    const list = [entry({ id: 1, conference: 'ASPLOS' }), entry({ id: 2, conference: 'IEEE SP 2024' }), entry({ id: 3, conference: 'IMCOM' })];
    expect(entriesOf({ acronym: 'SP', name: 'SP' }, list).map((e) => e.id)).toEqual([2]);
    expect(entriesOf({ acronym: 'IMC', name: 'IMC' }, list)).toEqual([]);
  });
  it('counts the same papers as the suggestions do', () => {
    const list = [
      entry({ id: 1, conference: 'Sigcomm 2021' }), entry({ id: 2, conference: 'ACM Symposium on Cloud Computing' }), entry({ id: 3, conference: 'IEEE CLOUD 2022' }),
      entry({ id: 4, journal: 'Up to date networking' }), entry({ id: 5, conference: 'DATE 2020' }), entry({ id: 6, kind: 'rfc', conference: 'SIGCOMM' }),
      entry({ id: 7, journal: 'CoRR' }),
    ];
    expect(entriesOf({ acronym: 'SIGCOMM', name: 'ACM SIGCOMM Conference' }, list).map((e) => e.id)).toEqual([1]);
    expect(entriesOf({ acronym: 'CLOUD', name: 'IEEE International Conference on Cloud Computing' }, list).map((e) => e.id)).toEqual([3]);
    expect(entriesOf({ acronym: 'DATE', name: 'Design, Automation and Test in Europe' }, list).map((e) => e.id)).toEqual([5]);
    expect(entriesOf({ acronym: 'CoRR', name: 'Computing Research Repository' }, list)).toEqual([]);
  });
  it('does not match on a one-letter acronym or on nothing', () => {
    expect(entriesOf({ acronym: 'A', name: '' }, [entry({ id: 1, conference: 'A B C' })])).toEqual([]);
    expect(entriesOf({ acronym: '', name: '' }, es)).toEqual([]);
  });
});

describe('feedUrl', () => {
  it('builds the address to paste into a calendar', () => {
    expect(feedUrl('https://d.example', 'a'.repeat(48), true)).toBe(`https://d.example/cal/${'a'.repeat(48)}.ics`);
    expect(feedUrl('https://d.example', 'abc', false)).toBe('https://d.example/cal/abc.ics?estimated=0');
  });
});
