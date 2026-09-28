import type { VenueKind } from '../../shared/venues';

/** 国際会議と論文誌で変わる言葉 */
export interface Words {
  /** 年ごとの単位 (開催 / 特集号) */
  unit: string;
  units: string;
  lead: string;
  empty: string;
  emptyNote: string;
  search: string;
  listLabel: string;
}

export const WORDS: Record<VenueKind, Words> = {
  conference: {
    unit: '開催', units: '年ごとの開催',
    lead: '追跡している国際会議の締切と開催日を、近い順に並べます。',
    empty: 'まだ国際会議がありません',
    emptyNote: 'IMC、SIGCOMM、NSDI、NDSS などは公開データから、CCNC などそこに無い会議は WikiCFP から取り込めます。',
    search: '公開データから追加', listLabel: '国際会議',
  },
  journal: {
    unit: '特集号', units: '特集号',
    lead: '投稿先として追跡している論文誌を並べます。',
    empty: 'まだ論文誌がありません',
    emptyNote: '名前で検索すると、ISSN と出版社を入れた状態で追加できます。',
    search: '検索して追加', listLabel: '論文誌',
  },
};
