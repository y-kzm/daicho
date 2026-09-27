import type { Project } from '../../../shared/types';
import { api } from '../../api';

/** 操作後の再読み込みと通知。呼び出し側の useAppData().reload と useToast() を渡す。 */
export interface ActionDeps { reload: () => Promise<void>; toast: (msg: string, isError?: boolean) => void }

/** 改名する。空文字・同名なら何もしないで false。 */
export async function renameProject(p: Project, name: string, { reload, toast }: ActionDeps): Promise<boolean> {
  const next = name.trim();
  if (!next || next === p.name) return false;
  try {
    await api.updateProject(p.id, { name: next });
    await reload();
    toast('名前を変更しました');
    return true;
  } catch (err) {
    toast((err as Error).message, true);
    return false;
  }
}

export async function setProjectArchived(p: Project, archived: boolean, { reload, toast }: ActionDeps): Promise<void> {
  try {
    await api.updateProject(p.id, { archived });
    await reload();
    toast(archived ? 'アーカイブしました' : 'アーカイブを解除しました');
  } catch (err) {
    toast((err as Error).message, true);
  }
}
