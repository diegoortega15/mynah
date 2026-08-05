import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import type { ComprehensionQuestion } from './types';

// Optional comprehension check shown AFTER a dialogue or a reading, collapsed
// by default. Input stays the focus: nothing is graded, nothing is required —
// it just answers "did I really understand, or did it wash over me?".
// Wrong answers are also the honest signal that the text was above level.
//
// The score is also reported once, tagged with the LEVEL of the content, so it
// can accumulate into evidence about the learner (see /api/users/:id/level-hint).
export default function ComprehensionQuiz({
  questions,
  kind = 'áudio',
  userId,
  source,
  sourceId,
  cefr,
}: {
  questions: ComprehensionQuestion[];
  kind?: string;
  userId?: number;
  source?: 'dialogue' | 'reading';
  sourceId?: number;
  cefr?: string | null;
}) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const reported = useRef(false);

  const answered = Object.keys(picked).length;
  const right = questions.filter((q, i) => picked[i] === q.answer).length;

  // Report once, only when the whole quiz is done and the content's level is
  // known — a score without a level says nothing about the learner.
  useEffect(() => {
    if (reported.current || answered !== questions.length || !questions.length) return;
    if (!userId || !source || !cefr) return;
    reported.current = true;
    api
      .recordComprehension(userId, { source, source_id: sourceId, cefr, correct: right, total: questions.length })
      .catch(() => {
        /* a evidência é um extra: falhar aqui não pode atrapalhar o estudo */
      });
  }, [answered, questions.length, right, userId, source, sourceId, cefr]);

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
