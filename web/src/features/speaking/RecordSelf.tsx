import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useRecorder } from '../../hooks/useRecorder.js';
import FeedbackView from './FeedbackView.jsx';
import { fmtWhen as when } from '../../format.js';
import type { User, Recording } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const REC_PROMPTS = [
  'Descreva seu trabalho e o que você faz num dia típico.',
  'Conte sobre um projeto recente: objetivo, seu papel e o resultado.',
  'Explique um problema que você resolveu no trabalho e como.',
  'Fale sobre suas metas profissionais para os próximos meses.',
  'Descreva sua rotina da manhã, do começo ao fim.',
  'Dê sua opinião sobre trabalho remoto vs. presencial.',
];

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const scoreCls = (n: number) => (n >= 80 ? 'good' : n >= 50 ? 'mid' : 'low');

export default function RecordSelf({ user, onPractice }: { user: User; onPractice?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Recording[]>([]);
  const [err, setErr] = useState('');
  const [prompt, setPrompt] = useState(REC_PROMPTS[0]);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null); // recording armed for deletion
  const [delBusy, setDelBusy] = useState(false);
  const [camBusy, setCamBusy] = useState(false);

  async function loadCatalog() {
    try {
      setItems(await api.listRecordings(user.id));
    } catch {}
  }
  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const { videoRef, stream, recording, elapsed, liveTranscript, enableCam, disableCam, start, stop } =
    useRecorder({
      onError: setErr,
      onSaved: async ({ blob, transcript }) => {
        setBusy(true);
        try {
          const { id } = await api.uploadRecording(user.id, blob, 'video', prompt);
          if (transcript) await api.saveTranscript(id, transcript, user.id).catch(() => {});
          await loadCatalog();
          onPractice?.();
        } catch (e) {
          setErr(errMsg(e));
        } finally {
          setBusy(false);
        }
      },
    });

  async function analyze(id: number) {
    setAnalyzing(id);
    setErr('');
    try {
      const fb = await api.analyzeRecording(id, user.id);
      setItems((its) => its.map((r) => (r.id === id ? { ...r, feedback: fb } : r)));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setAnalyzing(null);
    }
  }
  async function remove(id: number) {
    if (delBusy) return;
    setDelBusy(true);
    setConfirmDel(null);
    await api.deleteRecording(id, user.id).catch(() => {});
    await loadCatalog();
    setDelBusy(false);
  }

  return (
    <>
      <section className="card">
        <h2>Grave-se falando (~2 min)</h2>
        <p className="muted small">
          O plano recomenda gravar ~2 min e se ouvir depois — é o feedback mais honesto (você percebe
          travas e erros). Guarde para comparar sua evolução com o tempo.
        </p>
        <div className="rec-prompt">
          🎯 {prompt}{' '}
          <button
            className="linklike"
            onClick={() => setPrompt(REC_PROMPTS[(REC_PROMPTS.indexOf(prompt) + 1) % REC_PROMPTS.length])}
          >
            trocar tema
          </button>
        </div>

        {!stream ? (
          <button
            className="primary"
            disabled={camBusy}
            onClick={async () => {
              if (camBusy) return;
              setCamBusy(true);
              await enableCam();
              setCamBusy(false);
            }}
          >
            {camBusy ? 'Aguardando permissão…' : '🎥 Ativar câmera e microfone'}
          </button>
        ) : (
          <>
            <div className="rec-preview">
              <video ref={videoRef} autoPlay muted playsInline />
              {recording && (
                <span className="rec-timer"><span className="rec-dot" /> {mmss(elapsed)}</span>
              )}
            </div>
            <div className="row center-row">
              {!recording ? (
                <>
                  <button className="primary" onClick={start} disabled={busy}>
                    {busy ? 'Salvando…' : '● Gravar'}
                  </button>
                  <button className="ghost" onClick={disableCam} disabled={busy}>
                    Desligar câmera
                  </button>
                </>
              ) : (
                <button className="danger-btn" onClick={stop}>■ Parar e salvar</button>
              )}
            </div>
            {recording && (
              <p className="muted small live-tx">📝 {liveTranscript || 'Capturando o que você fala (para o feedback da IA)…'}</p>
            )}
          </>
        )}
        {err && <p className="error small">{err}</p>}
      </section>

      <section className="card">
        <h2>Minhas gravações</h2>
        {items.length === 0 && <p className="muted">Nenhuma gravação ainda. Grave a primeira! 🎥</p>}
        <ul className="rec-list">
          {items.map((r) => {
            const open = openId === r.id;
            return (
              <li key={r.id} className={`rec-item ${open ? 'open' : ''}`}>
                <div className="rec-head">
                  <button className="rec-toggle" onClick={() => setOpenId(open ? null : r.id)}>
                    <span className="chev">{open ? '▾' : '▸'}</span>
                    <span className="rec-when">{when(r.created_at)}</span>
                    <span className="rec-theme">{r.prompt || 'Gravação'}</span>
                    {r.feedback && (
                      <span className={`fb-score mini ${scoreCls(r.feedback.score)}`}>{r.feedback.score}</span>
                    )}
                  </button>
                  {confirmDel === r.id ? (
                    <>
                      <button className="ghost mini" onClick={() => setConfirmDel(null)}>✕</button>
                      <button className="danger-btn mini" disabled={delBusy} onClick={() => remove(r.id)}>
                        {delBusy ? '…' : 'Excluir?'}
                      </button>
                    </>
                  ) : (
                    <button className="ghost mini del" title="Excluir" aria-label="Excluir gravação" onClick={() => setConfirmDel(r.id)}>🗑</button>
                  )}
                </div>

                {open && (
                  <div className="rec-body">
                    <video className="rec-playback" controls src={api.recordingUrl(r.id, user.id)} />
                    {r.transcript && (
                      <details className="tx-details">
                        <summary className="muted small">Ver transcrição do que você falou</summary>
                        <p className="tx" lang="en">{r.transcript}</p>
                      </details>
                    )}
                    {r.feedback ? (
                      <FeedbackView fb={r.feedback} />
                    ) : r.transcript ? (
                      <button className="primary" disabled={analyzing === r.id} onClick={() => analyze(r.id)}>
                        {analyzing === r.id ? 'Analisando…' : '🤖 Analisar fala com IA'}
                      </button>
                    ) : (
                      <p className="muted small">
                        Sem transcrição (o reconhecimento de voz não capturou). Grave num ambiente
                        silencioso, falando claro, para receber feedback da IA.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
