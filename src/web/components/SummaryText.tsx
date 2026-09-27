import { parseSummary } from '../lib/summary';

export function SummaryText({ text }: { text: string }) {
  const blocks = parseSummary(text);
  if (!blocks) return <div className="summary">{text}</div>;
  return (
    <div className="summary">
      {blocks.map((b, i) => (
        <div className="qa" key={i}>
          {b.q ? (<><span className="q">{b.q}</span><span className="a">{b.a}</span></>) : b.a}
        </div>
      ))}
    </div>
  );
}
