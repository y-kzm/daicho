import { useState } from 'react';
import { api } from '../../api';
import { navigate, type Route } from '../../lib/router';
import { useAppData } from '../../state/AppDataContext';
import { useDialogs } from '../../state/DialogContext';
import { useDrive } from '../../state/DriveContext';
import { useToast } from '../../state/useToast';
import { SideItem } from './SideItem';

const SERVICES: [string, string, string][] = [
  ['https://www.crossref.org/', 'Crossref API', 'DOI メタデータ'],
  ['https://datacite.org/', 'DataCite API', 'arXiv 等プレプリント DOI のメタデータ'],
  ['https://japanlinkcenter.org/', 'JaLC API', '日本の学会誌 DOI のメタデータ'],
  ['https://www.semanticscholar.org/product/api', 'Semantic Scholar API', 'アブストラクト取得'],
  ['https://openalex.org/', 'OpenAlex API', 'アブストラクト取得・ジャーナルの出版国判定・論文誌の検索'],
  ['https://aistudio.google.com/', 'Google Gemini API', '概要の自動生成'],
  ['https://platform.claude.com/', 'Claude API', '概要の自動生成'],
  ['https://portal.core.edu.au/conf-ranks/', 'CORE Portal', 'CORE Ranking の自動検索'],
  ['https://datatracker.ietf.org/', 'IETF Datatracker', 'Internet-Draft のメタデータ'],
  ['https://tex2e.github.io/rfc-translater/html/index.html', 'RFC Translater', 'RFC エントリのリンク先 (日本語訳)'],
  ['https://developers.google.com/drive', 'Google Drive API', 'PDF の保存'],
  ['https://github.com/ccfddl/ccf-deadlines', 'ccfddl/ccf-deadlines', '国際会議の締切 (MIT License)'],
  ['http://www.wikicfp.com/', 'WikiCFP', '国際会議の締切 (CC BY-SA 3.0)'],
];

/** showStats: プロジェクトを開いている間は、統計を「このプロジェクト」の中に出すのでここでは出さない */
export function SidebarFooter({ route, showStats = true }: { route: Route; showStats?: boolean }) {
  const { data, applyData } = useAppData();
  const { status, disconnect } = useDrive();
  const [oaBusy, setOaBusy] = useState('');
  // DOI があって、まだ Open Access を判定していない論文
  const unchecked = data.entries.filter((e) => e.kind === 'paper' && e.doi && !e.oa.checkedAt).length;
  const checkAll = async () => {
    if (oaBusy) return;
    let done = 0;
    try {
      for (;;) {
        setOaBusy(`判定中… ${done} 件`);
        const r = await api.checkOaBatch();
        applyData(r);
        done += r.checked;
        // 1 件も判定できなかった回が出たら止める (同じものを問い合わせ続けないように)
        if (r.remaining <= 0 || r.checked === 0) break;
      }
      toast(`Open Access を ${done} 件判定しました`);
    } catch (err) {
      toast(`${done} 件判定したところで止まりました: ${(err as Error).message}`, true);
    } finally {
      setOaBusy('');
    }
  };
  const { open } = useDialogs();
  const toast = useToast();
  const askDisconnect = () => open({
    kind: 'confirm', title: 'Google Drive の接続を外す',
    body: '接続を外すと、PDF の追加と削除ができなくなります。Google Drive のファイルと、論文に付けた URL は残ります。',
    confirmLabel: '接続を外す',
    onConfirm: async () => { await disconnect(); toast('Google Drive の接続を外しました'); },
  });
  return (
    <div className="side-foot">
      {showStats && <SideItem label="統計" on={route.name === 'stats'} onClick={() => navigate({ name: 'stats' })} />}

      <details className="side-acc">
        <summary>設定とリンク</summary>
        <div className="side-links">
          <a href={api.exportUrl('csv')}>CSV でエクスポート</a>
          <a href={api.exportUrl('json')}>JSON でエクスポート</a>
          {unchecked > 0 && (
            <button type="button" className="side-link-btn" disabled={oaBusy !== ''} onClick={() => void checkAll()}
              title="DOI のある論文が誰でも読めるかを、OpenAlex で調べます">
              {oaBusy || `Open Access をまとめて判定 (${unchecked} 件)`}
            </button>
          )}
          <a href={data.links.jcr} target="_blank" rel="noopener">Journal Citation Reports ↗</a>
          <a href={data.links.core} target="_blank" rel="noopener">CORE Conference Ranks ↗</a>
        </div>
        {status?.configured && (
          <>
            <div className="side-sub">Google Drive</div>
            <div className="side-links">
              {status.connected
                ? <button type="button" className="side-link-btn" onClick={askDisconnect}>接続を外す</button>
                : <a href={api.driveConnectUrl}>接続する</a>}
            </div>
          </>
        )}
        <div className="side-sub">利用しているサービス</div>
        <div className="side-links">
          {SERVICES.map(([href, name, note]) => (
            <a key={href} href={href} target="_blank" rel="noopener">
              {name} ↗
              <span className="side-link-note">{note}</span>
            </a>
          ))}
        </div>
        <div className="side-note">DOI 未登録の論文は、論文ページの citation メタタグと abstract 欄から直接取得します。</div>
      </details>
    </div>
  );
}
