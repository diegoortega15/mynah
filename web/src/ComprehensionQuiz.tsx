import { useState } from 'react';
import type { ComprehensionQuestion } from './types';

// Optional comprehension check shown AFTER a dialogue or a reading, collapsed
// by default. Input stays the focus: nothing is graded, nothing is required —
// it just answers "did I really understand, or did it wash over me?".
// Wrong answers are also the honest signal that the text was above level.
export default function ComprehensionQuiz({
  questions,
  kind = 'áudio',
}: {
  questions: ComprehensionQuestion[];
  kind?: string;
}) {
  const [picked, setPicked] = useState<Record<number, number>>({});

  const answered = Object.keys(picked).length;
  const right = questions.filter((q, i) => picked[i] === q.answer).length;

  return (
    <details className="quiz">
      <summary>
        ✅ Testar se entendi{' '}
        <span className="muted small">(opcional, {questions.length} perguntas)</span>
      </summary>
      <p className="muted small">
        Sem nota e sem pressa — é só um espelho pra saber se o sentido chegou. Se errar, volte à
        parte citada.
      </p>
      {questions.map((q, qi) => {
        const chosen = picked[qi];
        const done = chosen !== undefined;
        return (
          <div key={qi} className="quiz-q">
            <p className="quiz-title" lang="en">
              {qi + 1}. {q.q}
            </p>
            <div className="quiz-opts">
              {q.options.map((o, oi) => {
                const isRight = oi === q.answer;
                const cls = !done ? '' : isRight ? 'ok' : chosen === oi ? 'bad' : '';
                return (
                  <button
                    key={oi}
                    className={`quiz-opt ${cls}`}
                    disabled={done}
                    lang="en"
                    onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                  >
                    {done && isRight ? '✓ ' : done && chosen === oi ? '✗ ' : ''}
                    {o}
                  </button>
                );
              })}
            </div>
            {done && q.why && <p className="muted small">💡 {q.why}</p>}
          </div>
        );
      })}
      {answered === questions.length && (
        <p className="comment">
          {right === questions.length
            ? `🎉 Entendeu tudo! Pode partir para o próximo ${kind}.`
            : right === 0
              ? `Você acertou 0/${questions.length}. Isso costuma significar que o material está acima do seu nível — vale baixar um nível no Perfil.`
              : `Você acertou ${right}/${questions.length}. Vale rever as partes citadas — reler/reouvir entendendo vale mais que passar por cima de novo.`}
        </p>
      )}
    </details>
  );
}
