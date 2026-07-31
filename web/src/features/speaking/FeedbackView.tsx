import type { SpeechFeedback } from '../../types';

export default function FeedbackView({ fb }: { fb: SpeechFeedback }) {
  const cls = fb.score >= 80 ? 'good' : fb.score >= 50 ? 'mid' : 'low';
  return (
    <div className="rec-feedback">
      <div className="row between">
        <strong>Feedback da IA</strong>
        {typeof fb.score === 'number' && <span className={`fb-score ${cls}`}>{fb.score}/100</span>}
      </div>
      {fb.comment && <p className="comment">💬 {fb.comment}</p>}
      {fb.strengths?.length > 0 && (
        <>
          <h3>✅ Pontos fortes</h3>
          <ul>{fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </>
      )}
      {fb.improvements?.length > 0 && (
        <>
          <h3>🎯 Pra melhorar</h3>
          <ul>{fb.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </>
      )}
      {fb.corrections?.length > 0 && (
        <>
          <h3>✏️ Correções</h3>
          <ul className="errors">
            {fb.corrections.map((c, i) => (
              <li key={i}>
                <span className="wrong">{c.original}</span> → <span className="right">{c.better}</span>
                {c.why && <div className="muted small">{c.why}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
