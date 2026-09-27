import { api } from '../../api';
import { navigate, type Route } from '../../lib/router';
import { useAppData } from '../../state/AppDataContext';
import { SideItem } from './SideItem';

const SERVICES: [string, string, string][] = [
  ['https://www.crossref.org/', 'Crossref API', 'DOI メタデータ'],
  ['https://datacite.org/', 'DataCite API', 'arXiv 等プレプリント DOI のメタデータ'],
  ['https://japanlinkcenter.org/', 'JaLC API', '日本の学会誌 DOI のメタデータ'],
  ['https://www.semanticscholar.org/product/api', 'Semantic Scholar API', 'アブストラクト取得'],
  ['https://openalex.org/', 'OpenAlex API', 'アブストラクト取得・ジャーナルの出版国判定'],
  ['https://aistudio.google.com/', 'Google Gemini API', '概要の自動生成'],
  ['https://platform.claude.com/', 'Claude API', '概要の自動生成'],
  ['https://portal.core.edu.au/conf-ranks/', 'CORE Portal', 'CORE Ranking の自動検索'],
  ['https://datatracker.ietf.org/', 'IETF Datatracker', 'Internet-Draft のメタデータ'],
  ['https://tex2e.github.io/rfc-translater/html/index.html', 'RFC Translater', 'RFC エントリのリンク先 (日本語訳)'],
];

/** showStats: プロジェクトを開いている間は、統計を「このプロジェクト」の中に出すのでここでは出さない */
export function SidebarFooter({ route, showStats = true }: { route: Route; showStats?: boolean }) {
  const { data } = useAppData();
  return (
    <>
      <h3>その他</h3>
      {showStats && <SideItem label="統計" on={route.name === 'stats'} onClick={() => navigate({ name: 'stats' })} />}

      <details className="side-acc">
        <summary>リンク</summary>
        <div className="side-links">
          <a href={data.links.jcr} target="_blank" rel="noopener">Journal Citation Reports ↗</a>
          <a href={data.links.core} target="_blank" rel="noopener">CORE Conference Ranks ↗</a>
          <a href={api.exportUrl('csv')}>CSV でエクスポート ↓</a>
          <a href={api.exportUrl('json')}>JSON でエクスポート ↓</a>
        </div>
      </details>

      <details className="side-acc">
        <summary>利用サービス</summary>
        <div className="side-links">
          {SERVICES.map(([href, name, note]) => (
            <div key={href}>
              <a href={href} target="_blank" rel="noopener">{name} ↗</a>
              <div className="side-note svc">{note}</div>
            </div>
          ))}
        </div>
        <div className="side-note">このほか、DOI 未登録の論文は、論文ページの citation メタタグ、abstract 欄から直接取得します。</div>
      </details>
    </>
  );
}
