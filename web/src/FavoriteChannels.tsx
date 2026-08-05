import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Channel } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The learner's favourite YouTube channels, shared by the list card and the
 * "save this video's channel" button in the player.
 */
export function useChannels(uid: number) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    try {
      setChannels(await api.listChannels(uid));
    } catch {
      /* a lista é opcional — sem canais a aba continua funcionando */
    }
  }, [uid]);
  useEffect(() => {
    reload();
  }, [reload]);

  /** Returns a short message to show, or '' when nothing to say. */
  const add = useCallback(
    async (input: string): Promise<string> => {
      if (!input.trim() || busy) return '';
      setBusy(true);
      setErr('');
      try {
        const ch = await api.addChannel(uid, { input: input.trim() });
        await reload();
        return ch.already ? `"${ch.name}" já estava nos seus canais.` : `"${ch.name}" salvo!`;
      } catch (e) {
        setErr(errMsg(e));
        return '';
      } finally {
        setBusy(false);
      }
    },
    [uid, busy, reload]
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await api.deleteChannel(id, uid);
        await reload();
      } catch (e) {
        setErr(errMsg(e));
      }
    },
    [uid, reload]
  );

  return { channels, add, remove, busy, err, setErr };
}

type Ctl = ReturnType<typeof useChannels>;

/** Where a channel chip takes you: its videos, or a search inside it. */
function chipHref(url: string, term: string) {
  const base = url.replace(/\/$/, '');
  return term.trim()
    ? `${base}/search?query=${encodeURIComponent(term.trim())}`
    : `${base}/videos`;
}

export default function FavoriteChannels({ ctl }: { ctl: Ctl }) {
  const { channels, add, remove, busy, err, setErr } = ctl;
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function onAdd() {
    const m = await add(input);
    if (m) {
      setInput('');
      setMsg(m);
    }
  }

  return (
    <section className="card">
      <h2>⭐ Meus canais</h2>
      <p className="muted small">
        Guarde os canais em que você gosta de procurar vídeo. Cole o endereço do canal
        (<code>youtube.com/@nome</code>) <em>ou</em> de qualquer vídeo dele — eu descubro o canal.
      </p>

      <div className="row gen">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setErr('');
            setMsg('');
          }}
          placeholder="@canal, link do canal ou link de um vídeo dele"
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <button className="primary" onClick={onAdd} disabled={busy || !input.trim()}>
          {busy ? 'Salvando…' : 'Salvar canal'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="muted small">{msg}</p>}

      {channels.length > 0 && (
        <>
          <div className="row gen chan-search">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="assunto (opcional) — ex.: job interview"
            />
          </div>
          <p className="muted small">
            {term.trim()
              ? `Clicar em um canal busca "${term.trim()}" dentro dele.`
              : 'Clicar em um canal abre os vídeos dele. Escolha um vídeo, copie o link e cole aqui em cima para estudar com a transcrição.'}
          </p>
          <ul className="chan-list">
            {channels.map((c) => (
              <li key={c.id} className="chan-chip">
                <a
                  href={chipHref(c.url, term)}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={term.trim() ? `Buscar "${term.trim()}" em ${c.name}` : `Abrir vídeos de ${c.name}`}
                >
                  {c.name}
                </a>
                {confirmId === c.id ? (
                  <>
                    <button className="ghost mini danger" onClick={() => remove(c.id)}>
                      remover?
                    </button>
                    <button className="ghost mini" onClick={() => setConfirmId(null)}>
                      não
                    </button>
                  </>
                ) : (
                  <button
                    className="ghost mini"
                    title={`Remover ${c.name}`}
                    onClick={() => setConfirmId(c.id)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
