import { useState } from 'react';
import { api, BIBTEX_LIMIT, BIBTEX_LIMIT_MESSAGE } from '../../api';
import { useToast } from '../../state/useToast';
import { Modal } from '../Modal';

interface Props { open: boolean; onClose: () => void; ids: number[] }
const PLACEHOLDER = '「生成する」を押すと BibTeX が表示されます。DOI がある文献は Crossref から著者情報込みで取得します (件数により数十秒かかります)。';

export function BibtexDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="bibDialog">
      <BibtexDialogBody {...props} />
    </Modal>
  );
}

function BibtexDialogBody({ onClose, ids }: Props) {
  const toast = useToast();
  const [out, setOut] = useState(PLACEHOLDER);
  const [busy, setBusy] = useState(false);
  const over = ids.length > BIBTEX_LIMIT;

  const run = async () => {
    if (!ids.length) { setOut('対象のエントリがありません。'); return; }
    if (over) { setOut(BIBTEX_LIMIT_MESSAGE); return; }
    setBusy(true);
    setOut('生成中… (DOI ありの文献は Crossref から取得しています)');
    try { setOut((await api.bibtex(ids)).bibtex); }
    catch (err) { setOut('エラー: ' + (err as Error).message); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(out); toast('コピーしました'); }
    catch { toast('コピーに失敗しました。手動で選択してください', true); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' }));
    a.download = 'references.bib';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="inner">
      <h2>BibTeX 出力</h2>
      <div className="bibopts">
        <span>対象: {ids.length} 件</span>
        <button className="sbtn" disabled={busy || over || !ids.length} onClick={() => void run()}>生成する</button>
        {over && <span className="side-note">{BIBTEX_LIMIT_MESSAGE}</span>}
      </div>
      <div id="bibOut" className="mono">{out}</div>
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>閉じる</button>
        <button type="button" className="submit" onClick={() => void copy()}>コピー</button>
        <button type="button" className="submit" onClick={download}>.bib をダウンロード</button>
      </div>
    </div>
  );
}
