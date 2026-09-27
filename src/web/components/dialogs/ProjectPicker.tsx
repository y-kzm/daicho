import { CITE_STATES, type CiteState, type EntryProjectInput, type Project } from '../../../shared/types';

interface Props {
  projects: Project[];
  selected: EntryProjectInput[];
  onChange: (next: EntryProjectInput[]) => void;
}

const INITIAL_STATE: CiteState = '気になる';

/** 追加ダイアログ: 登録と同時に入れるプロジェクトと、その引用状態を選ぶ */
export function ProjectPicker({ projects, selected, onChange }: Props) {
  const stateOf = (id: number) => selected.find((s) => s.projectId === id)?.state;
  const toggle = (id: number) => onChange(
    stateOf(id) === undefined ? [...selected, { projectId: id, state: INITIAL_STATE }] : selected.filter((s) => s.projectId !== id),
  );
  const setState = (id: number, state: CiteState) => onChange(selected.map((s) => (s.projectId === id ? { ...s, state } : s)));
  return (
    <div className="pp-field full">
      <span className="pp-field-label">プロジェクト (登録と同時に入れる)</span>
      <ul className="pp-pick">
        {projects.map((p) => {
          const state = stateOf(p.id);
          return (
            <li key={p.id}>
              <label>
                <input type="checkbox" checked={state !== undefined} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
              {state !== undefined && (
                <select aria-label={`${p.name} での引用状態`} value={state} onChange={(ev) => setState(p.id, ev.target.value as CiteState)}>
                  {CITE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
