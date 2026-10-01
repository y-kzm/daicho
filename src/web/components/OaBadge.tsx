import { isOpenAccess, isPublisherOpen, OA_LABELS, type Entry } from '../../shared/types';

/** Open Access の論文に付ける印。出版された版が読めるものと、別の版 (green) だけのものを分ける */
export function OaBadge({ e }: { e: Pick<Entry, 'oa'> }) {
  const s = e.oa.status;
  if (!isOpenAccess(s)) return null;
  const full = isPublisherOpen(s);
  return (
    <span className={'oa-badge' + (full ? '' : ' alt')} title={`Open Access: ${OA_LABELS[s]}`} aria-label={`Open Access: ${OA_LABELS[s]}`}>
      OA
    </span>
  );
}
