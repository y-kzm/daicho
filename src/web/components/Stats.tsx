import type { Entry } from '../../shared/types';
import { computeStats } from '../lib/stats';

function Bar({ label, val, max, cls }: { label: string; val: number; max: number; cls?: string }) {
  return (
    <div className="bar-row">
      <span className="label" title={label}>{label}</span>
      <span className="bar-track"><span className={'bar-fill ' + (cls || '')} style={{ width: (max ? Math.round((val / max) * 100) : 0) + '%' }} /></span>
      <span className="num mono">{val}</span>
    </div>
  );
}

function Card({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div className="stat-card">
      <h3>{title}</h3>
      {rows.length ? rows.map(([k, v]) => <Bar key={k} label={k} val={v} max={max} />) : <div className="empty">{empty}</div>}
    </div>
  );
}

export function Stats({ entries }: { entries: Entry[] }) {
  const s = computeStats(entries);
  return (
    <div className="stat-grid">
      <div className="stat-card">
        <h3>全体</h3>
        <div className="bignum">{s.total}<small>件</small></div>
        <div style={{ marginTop: 8 }}>
          <Bar label="未読" val={s.byRead['未読'] || 0} max={s.total} cls="grey" />
          <Bar label="斜め読み" val={s.byRead['斜め読み'] || 0} max={s.total} cls="amber" />
          <Bar label="精読済" val={s.byRead['精読済'] || 0} max={s.total} cls="green" />
        </div>
      </div>
      <Card title="出版年の分布" rows={s.years} empty="年データなし" />
      <Card title="CORE ランク分布" rows={s.byCore} empty="CORE データなし" />
      <Card title="タグ別件数" rows={s.topTags} empty="タグ未登録" />
      <Card title="出版元 上位" rows={s.topVenues} empty="データなし" />
    </div>
  );
}
