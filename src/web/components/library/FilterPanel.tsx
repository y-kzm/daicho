import type { ReactNode } from 'react';
import type { CiteState, FilterQuery, Priority, Project, ReadState } from '../../../shared/types';
import { CITE_STATES, PRIORITY_LABELS, READ_STATES } from '../../../shared/types';

const PRIORITY_ORDER: Priority[] = [3, 2, 1, 0];

interface Props {
  query: FilterQuery;
  tags: string[];
  /** プロジェクトを開いている間は空 (そのプロジェクトに固定されているので選ばせない) */
  projects: Project[];
  onChange: (patch: Partial<FilterQuery>) => void;
}

/** 1〜4 桁の西暦だけを受け付ける (負の数や指数表記は条件なしとして扱う) */
function toYear(v: string): number | undefined {
  return /^\d{1,4}$/.test(v.trim()) ? Number(v) : undefined;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fp-row">
      <div className="fp-label">{label}</div>
      <div className="fp-body">{children}</div>
    </div>
  );
}

/** 選択肢をその場で切り替える。何も選ばれていなければ undefined (= 条件なし) */
function Toggles<T extends string | number>({ options, selected, label, onChange }: {
  options: T[]; selected: T[] | undefined; label: (v: T) => string; onChange: (v: T[] | undefined) => void;
}) {
  const cur = selected ?? [];
  const toggle = (v: T) => {
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    onChange(next.length ? next : undefined);
  };
  return (
    <div className="fp-chips">
      {options.map((o) => (
        <button key={String(o)} type="button" className={'chip' + (cur.includes(o) ? ' on' : '')}
          aria-pressed={cur.includes(o)} onClick={() => toggle(o)}>{label(o)}</button>
      ))}
    </div>
  );
}

/** 「絞り込み」を開いたときの中身 */
export function FilterPanel({ query, tags, projects, onChange }: Props) {
  const star = query.starred === undefined ? '' : String(query.starred);
  return (
    <div className="fp">
      <Row label="読了">
        <Toggles<ReadState> options={[...READ_STATES]} selected={query.read} label={(s) => s} onChange={(read) => onChange({ read })} />
      </Row>
      <Row label="タグ">
        {tags.length
          ? <Toggles<string> options={tags} selected={query.tags} label={(t) => t} onChange={(t) => onChange({ tags: t })} />
          : <div className="fp-none">タグがありません</div>}
        {(query.tags?.length ?? 0) > 1 && (
          <div className="seg fp-mode" role="group" aria-label="タグの条件">
            <button type="button" className={query.tagMode !== 'all' ? 'on' : ''} aria-pressed={query.tagMode !== 'all'} onClick={() => onChange({ tagMode: undefined })}>いずれかを含む</button>
            <button type="button" className={query.tagMode === 'all' ? 'on' : ''} aria-pressed={query.tagMode === 'all'} onClick={() => onChange({ tagMode: 'all' })}>すべて含む</button>
          </div>
        )}
      </Row>
      {projects.length > 0 && (
        <Row label="プロジェクト">
          <select aria-label="プロジェクト" value={query.projectId ?? ''}
            onChange={(ev) => onChange({ projectId: ev.target.value ? Number(ev.target.value) : undefined })}>
            <option value="">すべて</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.archived ? `${p.name} (アーカイブ)` : p.name}</option>)}
          </select>
        </Row>
      )}
      <Row label="引用状態">
        <Toggles<CiteState> options={[...CITE_STATES]} selected={query.cite} label={(s) => s} onChange={(cite) => onChange({ cite })} />
      </Row>
      <Row label="年">
        <div className="fp-years">
          <input type="number" min={1} max={9999} aria-label="年 (から)" placeholder="から" value={query.yearFrom ?? ''}
            onChange={(ev) => onChange({ yearFrom: toYear(ev.target.value) })} />
          <span aria-hidden="true">〜</span>
          <input type="number" min={1} max={9999} aria-label="年 (まで)" placeholder="まで" value={query.yearTo ?? ''}
            onChange={(ev) => onChange({ yearTo: toYear(ev.target.value) })} />
        </div>
      </Row>
      <Row label="スター">
        <div className="seg" role="group" aria-label="スター">
          <button type="button" className={star === '' ? 'on' : ''} aria-pressed={star === ''} onClick={() => onChange({ starred: undefined })}>すべて</button>
          <button type="button" className={star === 'true' ? 'on' : ''} aria-pressed={star === 'true'} onClick={() => onChange({ starred: true })}>あり</button>
          <button type="button" className={star === 'false' ? 'on' : ''} aria-pressed={star === 'false'} onClick={() => onChange({ starred: false })}>なし</button>
        </div>
      </Row>
      <Row label="優先度">
        <Toggles<Priority> options={PRIORITY_ORDER} selected={query.priority}
          label={(p) => (p === 0 ? 'なし' : PRIORITY_LABELS[p])} onChange={(priority) => onChange({ priority })} />
      </Row>
    </div>
  );
}
