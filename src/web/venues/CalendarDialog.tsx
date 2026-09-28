import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useDialogs } from '../state/DialogContext';
import { useToast } from '../state/useToast';
import { feedUrl, venuesApi } from './api';
import { useVenues } from './VenuesContext';

interface Props { open: boolean; onClose: () => void }

export function CalendarDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="calendarDialog">
      <Body {...props} />
    </Modal>
  );
}

function Body({ onClose }: Props) {
  const { data, run } = useVenues();
  const { open } = useDialogs();
  const toast = useToast();
  const [estimated, setEstimated] = useState(true);
  const token = data.calendarToken;
  const url = token ? feedUrl(window.location.origin, token, estimated) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('URL をコピーしました');
    } catch {
      toast('コピーできませんでした。URL を選択してコピーしてください。', true);
    }
  };
  const rotate = () => open({
    kind: 'confirm', title: '購読用の URL を作り直す',
    body: '新しい URL を発行します。以前の URL は使えなくなるので、カレンダー側で登録し直す必要があります。', confirmLabel: '作り直す',
    onConfirm: async () => { await run(() => venuesApi.issueToken(), '新しい URL を発行しました'); },
  });
  const revoke = () => open({
    kind: 'confirm', title: '購読を止める',
    body: 'URL を無効にします。カレンダーには、取得済みの予定だけが残り、更新されなくなります。', confirmLabel: '無効にする',
    onConfirm: async () => { await run(() => venuesApi.revokeToken(), 'URL を無効にしました'); },
  });

  return (
    <div className="inner">
      <h2>カレンダーに出力</h2>

      <label className="vn-check">
        <input type="checkbox" checked={estimated} onChange={(ev) => setEstimated(ev.target.checked)} />
        予想の日付も含める (題名に「(予想)」が付きます)
      </label>

      <section className="vn-cal-sec">
        <h3>購読する (おすすめ)</h3>
        <p className="vn-dialog-note">
          Google カレンダーが、この URL を定期的に取りに来ます。締切を直すと、カレンダーにも反映されます。反映までは半日から 1 日ほどかかります。
        </p>
        {token ? (
          <>
            <div className="vn-cal-url">
              <input readOnly aria-label="購読用の URL" value={url} onFocus={(ev) => ev.currentTarget.select()} />
              <button type="button" className="sbtn" onClick={() => void copy()}>コピー</button>
            </div>
            {!/^https:\/\//.test(url) || /\.workers\.dev$/.test(window.location.hostname) ? (
              <p className="vn-dialog-note" role="note">
                この URL は、今開いているアドレス ({window.location.host}) のものです。ふだん使うアドレスで開いてから、コピーしてください。
              </p>
            ) : null}
            <ol className="vn-steps">
              <li>Google カレンダーを開き、左の「他のカレンダー」の ＋ を押す</li>
              <li>「URL で追加」を選び、上の URL を貼り付ける</li>
            </ol>
            <p className="vn-dialog-note">
              この URL を知っている人は、ログインなしで会議名と日付を見られます。メモや論文の情報は含みません。
              初めて使うときは、Cloudflare Access で <code>/cal/</code> を保護の対象から外す設定が必要です (BUILD.md の 9 節)。
            </p>
            <div className="menu-actions">
              <button type="button" className="sbtn" onClick={rotate}>URL を作り直す</button>
              <button type="button" className="sbtn danger" onClick={revoke}>購読を止める</button>
            </div>
          </>
        ) : (
          <button type="button" className="hbtn" onClick={() => void run(() => venuesApi.issueToken(), '購読用の URL を発行しました')}>購読用の URL を発行する</button>
        )}
      </section>

      <section className="vn-cal-sec">
        <h3>ファイルで取り込む</h3>
        <p className="vn-dialog-note">今の内容をファイルで保存し、カレンダーに取り込みます。あとから締切を直しても、カレンダーには反映されません。</p>
        <a className="hbtn" href={venuesApi.downloadUrl + (estimated ? '' : '?estimated=0')}>.ics をダウンロード</a>
      </section>

      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
