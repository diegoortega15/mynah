import { useState } from 'react';
import { api } from './api.js';
import { useSpeech } from './useSpeech.js';
import { levelLabel } from './levels.js';
import type { PlacementStep, PlacementAnswer, PlacementResult } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Adaptive placement test. The server holds the item bank and decides what to
 * ask next; this component only collects answers and narrates the listening
 * items with the browser's own voice (local, free, no AI involved).
 *
 * The result never changes the profile on its own — `onApply` is only called
 * when the learner accepts it.
 */
export default function Placement({
  userId,
  onApply,
  onClose,
}: {
  userId: number;
  onApply: (level: string) => void;
  onClose: () => void;
}) {
  const { speak, stop, enVoices, ttsSupported } = useSpeech();
  // No English voice means the listening block would be narrated by whatever
  // voice exists — often a Portuguese one reading English. The server then
  // drops that block instead of scoring noise.
  const noAudio = !ttsSupported || enVoices.length === 0;
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [step, setStep] = useState<PlacementStep | null>(null);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [played, setPlayed] = useState(0); // replays of the current listening item

  async function advance(next: PlacementAnswer[]) {
    setBusy(true);
    setErr('');
    stop();
    try {
      const s = await api.placementStep(next, noAudio);
      setAnswers(next);
      if (s.done) {
        setResult(await api.savePlacement(userId, next));
        setStep(null);
      } else {
        setStep(s);
        setPlayed(0);
      }
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setStarted(true);
    await advance([]);
  }

  // Abandon mid-test: nothing is saved, so the profile is untouched.
  function quit() {
    stop();
    onClose();
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    try {
      await api.applyPlacement(userId, result.id);
      onApply(result.cefr);
    } catch (e) {
      setErr(errMsg(e));
      setApplying(false);
    }
  }

  // --- result ---------------------------------------------------------------
  if (result) {
    const b = result.blocks;
    return (
      <section className="card">
        <h2>Resultado do teste</h2>
        <p className="placement-verdict">{levelLabel(result.cefr)}</p>

        <ul className="placement-breakdown">
          <li>
            <strong>Vocabulário:</strong>{' '}
            {b.vocabNoise
              ? 'não contou — você marcou palavras que não existem, então esse bloco não diz nada'
              : (b.vocab ?? '—')}
          </li>
          <li>
            <strong>Ouvir e entender:</strong>{' '}
            {b.listeningTotal === 0
              ? 'não avaliado — este navegador não tem voz em inglês instalada'
              : `${b.listening} (${b.listeningRight}/${b.listeningTotal} certas)`}
          </li>
          <li>
            <strong>Completar a frase:</strong> {b.cloze ?? '—'} ({b.clozeRight}/{b.clozeTotal}{' '}
            certas)
          </li>
        </ul>

        {result.differs ? (
          <>
            <p>
              Seu perfil está marcado como <strong>{result.current}</strong>. O teste indica{' '}
              <strong>{result.cefr}</strong>.
            </p>
            <p className="muted small">
              O nível decide o inglês que a IA produz em todo o app. Se ele estiver alto demais,
              tudo fica frustrante; baixo demais, você não aprende nada novo. Na dúvida, o mais
              baixo dos dois costuma render mais.
            </p>
            <div className="row gen">
              <button className="primary" onClick={apply} disabled={applying}>
                {applying ? 'Aplicando…' : `Usar ${result.cefr}`}
              </button>
              <button className="ghost" onClick={onClose} disabled={applying}>
                Manter {result.current}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Bate com o que já estava no seu perfil (<strong>{result.current}</strong>) — nada a
              mudar.
            </p>
            <button className="primary" onClick={onClose}>
              Fechar
            </button>
          </>
        )}
        {err && <p className="error">{err}</p>}
      </section>
    );
  }

  // --- intro ----------------------------------------------------------------
  if (!started) {
    return (
      <section className="card">
        <h2>Descobrir meu nível</h2>
        <p className="muted small">
          Cerca de 8 minutos, em três partes: palavras que você conhece, trechos falados para
          entender, e frases para completar. As perguntas se ajustam conforme você responde — se
          acertar, ficam mais difíceis.
        </p>
        {noAudio && (
          <p className="tx-local-note">
            ⚠️ Este navegador não tem voz em inglês instalada, então a parte de <strong>ouvir</strong>{' '}
            fica de fora e o teste mede só vocabulário e gramática. Para o resultado valer mais,
            configure uma voz antes (Chrome ou Edge trazem vozes em inglês).
          </p>
        )}
        <p className="muted small">
          <strong>Responda com sinceridade.</strong> O resultado não é uma nota: ele decide o
          inglês que a IA vai produzir pra você daqui em diante. Chutar para cima só torna o app
          frustrante.
        </p>
        <div className="row gen">
          <button className="primary" onClick={start} disabled={busy}>
            {busy ? 'Preparando…' : 'Começar'}
          </button>
          <button className="ghost" onClick={onClose} disabled={busy}>
            Agora não
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </section>
    );
  }

  if (!step) {
    return (
      <section className="card">
        <p className="muted">{err || 'Carregando…'}</p>
        {err && (
          <button className="ghost" onClick={onClose}>
            Fechar
          </button>
        )}
      </section>
    );
  }

  const pct = Math.round(((step.step - 1) / step.total) * 100);

  // --- block 1: vocabulary --------------------------------------------------
  if (step.item.block === 'vocab') {
    const toggle = (w: string) =>
      setKnown((s) => {
        const n = new Set(s);
        if (n.has(w)) n.delete(w);
        else n.add(w);
        return n;
      });
    return (
      <section className="card">
        <PlacementHead step={step} pct={pct} onQuit={quit} />
        <h2>Quais destas palavras você conhece?</h2>
        <p className="muted small">
          Marque só as que você saberia explicar ou usar numa frase. <strong>Atenção:</strong> há
          palavras inventadas na lista — marcar uma delas mostra que você está chutando, e esse
          bloco deixa de valer.
        </p>
        <div className="word-grid">
          {step.item.words.map((w) => (
            <button
              key={w}
              className={`word-opt ${known.has(w) ? 'sel' : ''}`}
              onClick={() => toggle(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="row gen">
          <button
            className="primary"
            disabled={busy}
            onClick={() => advance([...answers, { id: 'vocab', known: [...known] }])}
          >
            {busy ? 'Enviando…' : 'Continuar'}
          </button>
          <span className="muted small">{known.size} marcada(s)</span>
        </div>
        {err && <p className="error">{err}</p>}
      </section>
    );
  }

  // --- block 2: listening ---------------------------------------------------
  if (step.item.block === 'listening') {
    const { speak: text, q, options } = step.item;
    return (
      <section className="card">
        <PlacementHead step={step} pct={pct} onQuit={quit} />
        <h2>Ouça e responda</h2>
        <p className="muted small">
          Você pode ouvir de novo — mas responda o que entendeu, não o que adivinhou.
        </p>
        <button
          className="primary"
          onClick={() => {
            setPlayed((p) => p + 1);
            speak(text);
          }}
        >
          🔊 {played === 0 ? 'Ouvir' : 'Ouvir de novo'}
        </button>
        {played > 0 && (
          <>
            <p className="placement-q">{q}</p>
            <div className="opt-list">
              {options.map((o, i) => (
                <button
                  key={i}
                  className="opt"
                  disabled={busy}
                  onClick={() => advance([...answers, { id: step.item.id, value: i }])}
                >
                  {o}
                </button>
              ))}
            </div>
          </>
        )}
        {err && <p className="error">{err}</p>}
      </section>
    );
  }

  // --- block 3: gap fill ----------------------------------------------------
  return (
    <section className="card">
      <PlacementHead step={step} pct={pct} onQuit={quit} />
      <h2>Complete a frase</h2>
      <p className="placement-q">{step.item.text}</p>
      <div className="opt-list">
        {step.item.options.map((o, i) => (
          <button
            key={i}
            className="opt"
            disabled={busy}
            onClick={() => advance([...answers, { id: step.item.id, value: i }])}
          >
            {o}
          </button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function PlacementHead({
  step,
  pct,
  onQuit,
}: {
  step: PlacementStep;
  pct: number;
  onQuit: () => void;
}) {
  return (
    <div className="placement-head">
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="muted small">
        {step.step} de {step.total}
      </span>
      {/* An escape hatch on every step: a test you cannot abandon is a trap. */}
      <button className="ghost mini" title="Sair sem terminar" onClick={onQuit}>
        sair
      </button>
    </div>
  );
}
