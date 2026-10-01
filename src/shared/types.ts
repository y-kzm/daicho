export const READ_STATES = ['未読', '斜め読み', '精読済'] as const;
export const CITE_STATES = ['気になる', '引用候補', '引用する', '引用しない'] as const;
export const PRIORITIES = [0, 1, 2, 3] as const;
export const PRIORITY_LABELS = ['', '低', '中', '高'] as const;
export type ReadState = (typeof READ_STATES)[number];
export type CiteState = (typeof CITE_STATES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type LlmProvider = 'gemini' | 'claude';
export const BULK_MAX = 200;

export const JCR_URL =
  'https://jcr.clarivate.com/jcr/home?app=jcr&Init=Yes&authCode=null&SrcApp=IC2LS';
export const CORE_URL = 'https://portal.core.edu.au/conf-ranks/';

/** 文献の種類。論文以外も同じ台帳で管理する */
export const ENTRY_KINDS = ['paper', 'rfc', 'draft', 'whitepaper', 'other'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const KIND_LABELS: Record<EntryKind, string> = {
  paper: '論文', rfc: 'RFC', draft: 'Internet-Draft', whitepaper: 'ホワイトペーパー', other: 'その他の資料',
};
/** 一覧やカードに出す短い印 (論文には出さない) */
export const KIND_BADGES: Record<EntryKind, string> = { paper: '', rfc: 'RFC', draft: 'I-D', whitepaper: 'WP', other: '資料' };

/** サイドバーの入口。種類をまとめて 3 つの枠にする */
export const KIND_GROUPS = [
  { id: 'papers', label: '論文', kinds: ['paper'] },
  { id: 'standards', label: '標準文書 (RFC・I-D)', kinds: ['rfc', 'draft'] },
  { id: 'docs', label: '資料', kinds: ['whitepaper', 'other'] },
] as const satisfies readonly { id: string; label: string; kinds: readonly EntryKind[] }[];
export type KindGroupId = (typeof KIND_GROUPS)[number]['id'];

/** 状態の入力候補 (自由入力もできる) */
export const DOC_STATUS_HINTS: Record<EntryKind, readonly string[]> = {
  paper: [],
  rfc: ['Internet Standard', 'Proposed Standard', 'Draft Standard', 'Best Current Practice', 'Informational', 'Experimental', 'Historic'],
  draft: ['有効', '失効', '置き換え済み', 'RFC として発行済み'],
  whitepaper: ['公開中', '改訂あり', '公開終了'],
  other: [],
};

export const ATTACHMENT_KINDS = ['本文', '補足資料', 'スライド', 'その他'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
/** 1 ファイルの上限 (100 MB) */
export const PDF_MAX_BYTES = 100 * 1024 * 1024;
/** 1 論文に付けられる PDF の上限 */
export const ATTACHMENTS_MAX = 10;

/** 論文に付けた PDF。実体は Google Drive にあり、url は Drive の閲覧 URL */
export interface Attachment {
  id: number;
  kind: AttachmentKind;
  name: string;
  url: string;
  size: number;
  addedAt: string;
}

/** Google Drive の接続状態。configured = Worker に client id / secret がある */
export interface DriveStatus {
  configured: boolean;
  connected: boolean;
}

/** アップロード先 (Google が発行する URL)。ブラウザはここへ PDF を PUT する */
export interface UploadSession {
  uploadUrl: string;
  name: string;
}

export interface CiteInfo {
  state: CiteState;
  position: number;
  memo: string;
}

/**
 * Open Access の種類 (OpenAlex の oa_status)。'' = 未判定、unknown = OpenAlex に無い
 * gold / diamond / hybrid / bronze は出版社のサイトで読める。green は別の版 (プレプリントなど) が読める
 */
export const OA_STATUSES = ['gold', 'diamond', 'hybrid', 'bronze', 'green', 'closed', 'unknown'] as const;
export type OaStatus = (typeof OA_STATUSES)[number] | '';

export const OA_LABELS: Record<OaStatus, string> = {
  '': '未判定',
  gold: '出版社で公開 (gold)',
  diamond: '出版社で公開・無料で掲載 (diamond)',
  hybrid: '有料誌の中で公開 (hybrid)',
  bronze: '出版社で読める・ライセンス不明 (bronze)',
  green: '別の版が読める (green)',
  closed: '公開されていない',
  unknown: '判定できない (OpenAlex に無い)',
};

export interface OpenAccess {
  status: OaStatus;
  /** 読める場所 */
  url: string;
  license: string;
  /** 判定した日 (YYYY-MM-DD)。未判定は空 */
  checkedAt: string;
}

/** 誰でも読めるか (green は別の版が読める) */
export function isOpenAccess(s: OaStatus): boolean {
  return s === 'gold' || s === 'diamond' || s === 'hybrid' || s === 'bronze' || s === 'green';
}

/** 出版社のサイトで、出版された版が読めるか */
export function isPublisherOpen(s: OaStatus): boolean {
  return s === 'gold' || s === 'diamond' || s === 'hybrid' || s === 'bronze';
}

export interface Entry {
  id: number;
  added: string;
  tags: string[];
  title: string;
  summary: string;
  url: string;
  doi: string;
  year: string;
  country: string;
  publisher: string;
  journal: string;
  impactFactor: string;
  conference: string;
  core: string;
  bibkey: string;
  read: string;
  note: string;
  kind: EntryKind;
  /** 標準文書などの状態 (例: Internet Standard、有効、失効)。論文では空 */
  docStatus: string;
  starred: boolean;
  priority: Priority;
  lastOpenedAt: string;
  /** key = String(projectId) */
  cites: Record<string, CiteInfo>;
  attachments: Attachment[];
  /** Open Access の判定結果 (編集フォームではなく、別の API で変える) */
  oa: OpenAccess;
}

/** 追加・編集フォームから送る形 (cites / starred / priority / lastOpenedAt / attachments は別 API で変える) */
export type EntryInput = Omit<Entry, 'id' | 'added' | 'cites' | 'starred' | 'priority' | 'lastOpenedAt' | 'attachments' | 'oa'>;

/** 追加と同時に入れるプロジェクト (POST /api/entries の projects) */
export interface EntryProjectInput {
  projectId: number;
  state: CiteState;
}
/** 1 回の追加で指定できるプロジェクト数の上限 */
export const ENTRY_PROJECTS_MAX = 20;

export interface Project {
  id: number;
  name: string;
  note: string;
  archived: boolean;
  sortOrder: number;
  count: number;
}

export type SortKey = 'added' | 'title' | 'year' | 'venue' | 'core' | 'read' | 'priority' | 'lastOpened';
/** 'cite' はプロジェクトを開いているときだけ意味を持つ (引用状態ごと) */
export type GroupKey = 'none' | 'year' | 'read' | 'priority' | 'firstTag' | 'venue' | 'cite';

export interface FilterQuery {
  search?: string;
  read?: ReadState[];
  tags?: string[];
  tagMode?: 'any' | 'all';
  projectId?: number;
  kinds?: EntryKind[];
  cite?: CiteState[];
  yearFrom?: number;
  yearTo?: number;
  starred?: boolean;
  priority?: Priority[];
  unfiled?: boolean;
  sort?: SortKey;
  sortDir?: 'asc' | 'desc';
  groupBy?: GroupKey;
  /** true = Open Access の論文だけ */
  oa?: boolean;
}

export interface SavedFilter {
  id: number;
  name: string;
  sortOrder: number;
  query: FilterQuery;
}

export type BulkOp =
  | { type: 'tags'; add: string[]; remove: string[] }
  | { type: 'read'; state: ReadState }
  | { type: 'flags'; starred?: boolean; priority?: Priority }
  | { type: 'project'; projectId: number; state: CiteState }
  /** プロジェクトから外す (論文そのものは残す) */
  | { type: 'unproject'; projectId: number }
  | { type: 'delete' };

export interface AppData {
  entries: Entry[];
  tags: string[];
  projects: Project[];
  savedFilters: SavedFilter[];
  readStates: readonly string[];
  citeStates: readonly string[];
  links: { jcr: string; core: string };
  /** 論文の削除後に、Google Drive のゴミ箱へ移せずに残った PDF の件数 (削除の応答にだけ付く) */
  driveLeft?: number;
}

export interface DoiMetadata {
  doi: string;
  title: string;
  year: string;
  publisher: string;
  country: string;
  journal: string;
  conference: string;
  url: string;
  authors: string;
  bibkeySuggestion: string;
  /** 判別できた場合だけ入る (RFC・I-D) */
  kind?: EntryKind;
  docStatus?: string;
}

/** IETF の文書の現在の状態 (POST /api/metadata/ietf-status) */
export interface IetfStatus {
  docStatus: string;
  /** 登録している版より新しい I-D の名前 (例: draft-ietf-6man-xxx-07) */
  newerDraft?: string;
  /** I-D が RFC になっている場合の番号 */
  rfcNumber?: number;
  /** 利用者向けの 1 文 */
  message: string;
}

export interface CoreCandidate {
  title: string;
  acronym: string;
  source: string;
  rank: string;
  score?: number;
}

export interface CoreResult {
  candidates: CoreCandidate[];
  searchUrl: string;
  query: string;
}

export interface LlmInput {
  title: string;
  doi?: string;
  url?: string;
  summary?: string;
  provider?: LlmProvider;
}

export interface SummaryPromptResult {
  prompt: string;
  usedAbstract: boolean;
  abstractSource: string;
}

export interface SummaryResult extends SummaryPromptResult {
  summary: string;
  provider: string;
}

export interface TagProposal {
  id: number;
  title: string;
  current: string[];
  proposed: string[];
}

export interface DuplicateGroup {
  kind: 'title' | 'doi' | 'bibkey';
  key: string;
  ids: number[];
}

export interface BackfillVenueResult {
  dryRun: boolean;
  log: string[];
  filledIf: number;
  filledCore: number;
}

export interface BackfillCountryResult {
  dryRun: boolean;
  log: string[];
  checked: number;
  changed: number;
  skipped: number;
  failed: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}
