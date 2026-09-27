import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../../shared/types';
import { api } from '../../api';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { DetailPanel } from '../DetailPanel';

interface Props { project: Project; entryId: number | null; onCloseDetail: () => void; onEdit: (id: number) => void }

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';
const SAVE_LABEL: Record<SaveState, string> = { idle: '', dirty: '未保存', saving: '保存中…', saved: '保存済み' };
/** 入力が止まってから保存するまでの待ち時間 (仕様 §3.3) */
const NOTE_SAVE_DELAY_MS = 800;

export function ProjectPanel({ project, entryId, onCloseDetail, onEdit }: Props) {
  const { reload } = useAppData();
  const toast = useToast();
  const [note, setNote] = useState(project.note);
  const [status, setStatus] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  /** まだ送っていない本文。null = 送信済み */
  const pending = useRef<string | null>(null);
  /** 直前の render で見えていた project.id。project 切り替えの検出とクリーンアップでの
   * 送信先 id 解決に使う (どちらも id を引数で渡すので、古い render のクロージャは読まない) */
  const projectIdRef = useRef(project.id);
  const projectId = project.id;

  /** 指定した id 宛に即座に送る。reload / toast は Provider 内で安定している */
  const flush = (id: number, text: string) => {
    api.updateProject(id, { note: text }).then(reload, (err: Error) => toast(err.message, true));
  };

  const save = async (id: number, text: string) => {
    pending.current = null;
    setStatus('saving');
    try {
      await api.updateProject(id, { note: text });
      setStatus((s) => (s === 'saving' ? 'saved' : s)); // 保存中に打鍵があれば 'dirty' のまま
      void reload(); // data.projects[].note を最新にする (「保存しました」トーストは出さない)
    } catch (err) {
      // 後から打鍵が来ていなければ、この本文を未送信に戻す (切り替え・離脱時の flush で再送される)
      if (pending.current === null) pending.current = text;
      setStatus('dirty');
      toast((err as Error).message, true);
    }
  };

  const onChange = (text: string) => {
    setNote(text);
    pending.current = text;
    setStatus('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(projectId, text), NOTE_SAVE_DELAY_MS);
  };

  // project が切り替わったら、前のプロジェクト宛の未送信テキストをまず即座に送り、
  // それからこのプロジェクトの内容 (note / status) にリセットする。
  // 同じプロジェクト内での project.note 変化 (自分の保存が reload() で戻ってきた場合など) では
  // 走らない (deps は project.id のみ) ので、入力中のローカルテキストを上書きしない。
  useEffect(() => {
    const prevId = projectIdRef.current;
    projectIdRef.current = project.id;
    if (prevId === project.id) return;
    window.clearTimeout(timer.current);
    const text = pending.current;
    pending.current = null;
    if (text !== null) flush(prevId, text);
    setNote(project.note);
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // 画面を離れるときに未送信の本文があれば即座に送る
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    const text = pending.current;
    pending.current = null;
    if (text === null) return;
    flush(projectIdRef.current, text);
  }, []);

  return (
    <aside className="pp" aria-label="プロジェクトのパネル">
      <section className="pp-note">
        <div className="pp-head">
          <h3>プロジェクトメモ</h3>
          <span className={'pp-status ' + status}>{SAVE_LABEL[status]}</span>
        </div>
        <textarea value={note} aria-label="プロジェクトメモ"
          placeholder="目的、締切、構成のメモなど (入力を止めると自動保存)"
          onChange={(ev) => onChange(ev.target.value)} />
      </section>
      <section className="pp-detail">
        {entryId === null
          ? <div className="pp-hint">カードを選ぶと、論文の詳細とこのプロジェクト用のメモを表示します。</div>
          : <DetailPanel entryId={entryId} projectId={projectId} onClose={onCloseDetail} onEdit={onEdit} />}
      </section>
    </aside>
  );
}
