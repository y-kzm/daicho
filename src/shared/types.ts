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
  starred: boolean;
  priority: Priority;
  lastOpenedAt: string;
  /** key = String(projectId) */
  cites: Record<string, CiteInfo>;
  attachments: Attachment[];
}

/** 追加・編集フォームから送る形 (cites / starred / priority / lastOpenedAt / attachments は別 API で変える) */
export type EntryInput = Omit<Entry, 'id' | 'added' | 'cites' | 'starred' | 'priority' | 'lastOpenedAt' | 'attachments'>;

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
  cite?: CiteState[];
  yearFrom?: number;
  yearTo?: number;
  starred?: boolean;
  priority?: Priority[];
  unfiled?: boolean;
  sort?: SortKey;
  sortDir?: 'asc' | 'desc';
  groupBy?: GroupKey;
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
