import type {
  AppData, AttachmentKind, BulkOp, CiteState, CoreResult, DoiMetadata, DriveStatus, DuplicateGroup, EntryInput, EntryProjectInput,
  FilterQuery, IetfStatus, LlmInput, LlmProvider, UploadSession,
  Priority, ReadState, SummaryPromptResult, SummaryResult, TagProposal,
} from '../shared/types';

export class ApiError extends Error {}

export const SESSION_EXPIRED_MESSAGE = 'ログインセッションが切れました。ページを再読み込みしてください。';

/** BibTeX 1 回あたりの上限 (Worker の BIBTEX_MAX と同じ値。無料プランの subrequest 上限対策) */
export const BIBTEX_LIMIT = 45;
export const BIBTEX_LIMIT_MESSAGE = 'BibTeX は 1 回 45 件までです。選択を分けてください。';
/** 一括操作の上限 (契約 §1 BULK_MAX と同じ値) の文言。サーバーの 400 と同じ */
export const BULK_LIMIT_MESSAGE = '一度に扱えるのは 200 件までです。';

/** 論文を削除したあとの通知。Drive に残った PDF があれば、それも伝える */
export function deletedMessage(driveLeft: number | undefined): [string, boolean] {
  if (!driveLeft) return ['削除しました', false];
  return [`削除しました。PDF ${driveLeft} 件は Google Drive のゴミ箱へ移せなかったので、Drive の「Daicho」フォルダに残っています。`, true];
}

/**
 * Cloudflare Access のセッションが切れると、同一オリジンへの fetch が Access ドメインへの
 * 302 になる。`redirect: 'manual'` で追わせた場合、その応答は opaqueredirect (status 0) として
 * 見える。CORS 追従に失敗する前にここで検知する。
 */
export function isSessionRedirect(res: { type: string; status: number }): boolean {
  return res.type === 'opaqueredirect' || res.status === 0;
}

export async function parseApiResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (/text\/html/i.test(ct)) throw new ApiError(SESSION_EXPIRED_MESSAGE);
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error;
    throw new ApiError(msg || `HTTP ${res.status}`);
  }
  return json;
}

const LONG_TIMEOUT_MS = 90000; // LLM / BibTeX 生成向け

export async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
  } catch (err) {
    throw new ApiError(err instanceof DOMException && err.name === 'TimeoutError' ? 'サーバーからの応答がありません (タイムアウト)。' : 'ネットワークエラーが発生しました。');
  }
  if (isSessionRedirect(res)) throw new ApiError(SESSION_EXPIRED_MESSAGE);
  return (await parseApiResponse(res)) as T;
}

/** 戻り値を使わない更新系 */
async function send(method: string, path: string, body?: unknown): Promise<void> {
  await call<unknown>(method, path, body);
}

const enc = encodeURIComponent;

export interface ProjectPatch { name?: string; note?: string; archived?: boolean }
export interface FilterPatch { name?: string; query?: FilterQuery }
export interface ProjectEntryPatch { state?: CiteState; memo?: string }
export type ExportFormat = 'csv' | 'json';

export const api = {
  data: () => call<AppData>('GET', '/data'),

  // エントリ
  /** projects を渡すと、追加と同時にそのプロジェクトへ入れる */
  addEntry: (input: EntryInput, projects: EntryProjectInput[] = []) =>
    call<{ id: number }>('POST', '/entries', projects.length ? { ...input, projects } : input),
  updateEntry: (id: number, input: EntryInput) => send('PUT', `/entries/${id}`, input),
  /** driveLeft: Google Drive のゴミ箱へ移せずに残った PDF の件数 */
  deleteEntry: (id: number) => call<{ driveLeft?: number }>('DELETE', `/entries/${id}`),
  setRead: (id: number, state: ReadState) => send('PATCH', `/entries/${id}/read`, { state }),
  setCite: (id: number, projectId: number, state: string) => send('PATCH', `/entries/${id}/cite`, { projectId, state }),
  setFlags: (id: number, flags: { starred?: boolean; priority?: Priority }) => send('PATCH', `/entries/${id}/flags`, flags),
  touch: (id: number) => call<{ lastOpenedAt: string }>('POST', `/entries/${id}/touch`),
  bulk: (ids: number[], op: BulkOp) => call<AppData>('POST', '/entries/bulk', { ids, op }),
  merge: (keepId: number, removeIds: number[]) => call<AppData>('POST', '/entries/merge', { keepId, removeIds }),

  // プロジェクト (id ベース)
  addProject: (name: string) => call<{ id: number }>('POST', '/projects', { name }),
  updateProject: (id: number, patch: ProjectPatch) => send('PATCH', `/projects/${id}`, patch),
  deleteProject: (id: number) => send('DELETE', `/projects/${id}`),
  reorderProjects: (ids: number[]) => send('PUT', '/projects/order', { ids }),
  reorderColumn: (projectId: number, state: CiteState, entryIds: number[]) =>
    send('PUT', `/projects/${projectId}/order`, { state, entryIds }),
  updateProjectEntry: (projectId: number, entryId: number, patch: ProjectEntryPatch) =>
    send('PATCH', `/projects/${projectId}/entries/${entryId}`, patch),

  // 保存フィルタ
  addFilter: (name: string, query: FilterQuery) => call<{ id: number }>('POST', '/filters', { name, query }),
  updateFilter: (id: number, patch: FilterPatch) => send('PATCH', `/filters/${id}`, patch),
  deleteFilter: (id: number) => send('DELETE', `/filters/${id}`),
  reorderFilters: (ids: number[]) => send('PUT', '/filters/order', { ids }),

  // タグ (既存どおり AppData を返す)
  addTag: (name: string) => call<AppData>('POST', '/tags', { name }),
  renameTag: (from: string, to: string) => call<AppData>('PATCH', `/tags/${enc(from)}`, { name: to }),
  deleteTag: (name: string) => call<AppData>('DELETE', `/tags/${enc(name)}`),
  reorderTags: (order: string[]) => call<AppData>('PUT', '/tags/order', { order }),
  applyTagProposals: (proposals: { id: number; tags: string[] }[]) => call<AppData>('POST', '/tags/apply', { proposals }),

  // メタデータ・LLM
  doi: (input: string) => call<DoiMetadata>('POST', '/metadata/doi', { input }, 60000),
  core: (query: string) => call<CoreResult>('POST', '/metadata/core', { query }, 60000),
  /** RFC / Internet-Draft の今の状態を調べて、エントリに保存する */
  ietfStatus: (entryId: number) => call<IetfStatus>('POST', '/metadata/ietf-status', { entryId }, 60000),
  llmPrompt: (input: LlmInput) => call<SummaryPromptResult>('POST', '/llm/prompt', input, 60000),
  llmSummary: (input: LlmInput) => call<SummaryResult>('POST', '/llm/summary', input, LONG_TIMEOUT_MS),
  llmTags: (input: LlmInput) => call<{ tags: string[] }>('POST', '/llm/tags', input, LONG_TIMEOUT_MS),
  llmTagsBatch: (ids: number[], provider: LlmProvider) =>
    call<TagProposal[]>('POST', '/llm/tags/batch', { ids, provider }, LONG_TIMEOUT_MS),

  // PDF (実体は Google Drive)
  driveStatus: () => call<DriveStatus>('GET', '/drive/status'),
  /** Google の同意画面へ移動する URL (ページごと移動して使う) */
  driveConnectUrl: '/api/drive/connect',
  driveDisconnect: () => send('POST', '/drive/disconnect'),
  startUpload: (entryId: number, kind: AttachmentKind, file: { size: number; type: string }) =>
    call<UploadSession>('POST', '/attachments/session', { entryId, kind, size: file.size, mimeType: file.type }),
  addAttachment: (entryId: number, kind: AttachmentKind, fileId: string) =>
    call<AppData>('POST', '/attachments', { entryId, kind, fileId }),
  deleteAttachment: (id: number) => call<AppData>('DELETE', `/attachments/${id}`),

  // 出力・保守
  bibtex: (ids: number[]) => call<{ bibtex: string }>('POST', '/bibtex', { ids }, LONG_TIMEOUT_MS),
  duplicates: async (): Promise<DuplicateGroup[]> =>
    (await call<{ groups: DuplicateGroup[] }>('GET', '/maintenance/duplicates')).groups,
  exportUrl: (format: ExportFormat): string => `/api/export?format=${format}`,
};
