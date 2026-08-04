import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useSpeech } from './useSpeech.js';
import DayBanner from './DayBanner.jsx';
import HelpTip from './HelpTip.jsx';
import { useToday, useRefreshDay } from './queries.js';
import type { User, Dialogue, DialogueLine, TranscriptChunk, SavedYoutubeVideo } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// --- YouTube IFrame Player API (loaded once, lazily) ---
interface YTPlayer {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
}
interface YTApi {
  Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer;
}
let ytApiPromise: Promise<YTApi> | null = null;
function loadYouTubeApi(): Promise<YTApi> {
  const w = window as unknown as { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve((window as unknown as { YT: YTApi }).YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// Seconds → m:ss (or h:mm:ss for long videos).
const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

// How many lines ahead of the current one to translate in advance (so the PT is
// already ready by the time playback reaches each line).
const LOOKAHEAD = 2;

const THEMES = ['Daily standup', 'Negotiating a deadline', 'Job interview', 'Client kickoff', 'Giving feedback'];

const SOURCES = [
  { name: 'BBC Learning English', url: 'https://www.youtube.com/@bbclearningenglish', desc: 'Gratuito, ótimo para treinar o ouvido' },
  { name: 'Business English Pod', url: 'https://www.businessenglishpod.com/', desc: 'Reuniões, e-mails, apresentações' },
  { name: 'TED Talks', url: 'https://www.youtube.com/@TED', desc: 'Inglês real, quase sempre com legendas' },
  { name: 'English with Lucy', url: 'https://www.youtube.com/@EnglishwithLucy', desc: 'Pronúncia e vocabulário' },
  { name: 'Speak English With Vanessa', url: 'https://www.youtube.com/@SpeakEnglishWithVanessa', desc: 'Conversação natural do dia a dia' },
];

export default function Listening({ user }: { user: User }) {
  const [tab, setTab] = useState('ai'); // ai | youtube | tips
  const { data: today } = useToday(user.id);
  const refreshDay = useRefreshDay(user.id);

  return (
    <div className="listening">
      <h1>🎧 Ouvir <HelpTip topic="listening" /></h1>
      <DayBanner
        block={today?.blocks?.listen}
        doneText="Ouvir de hoje feito"
        pendingText="Ainda não ouviu hoje — ouça 1 diálogo (ou um vídeo do YouTube)."
      />
      <div className="chips tabs">
        <button className={`chip ${tab === 'ai' ? 'sel' : ''}`} onClick={() => setTab('ai')}>Diálogo (IA)</button>
        <button className={`chip ${tab === 'youtube' ? 'sel' : ''}`} onClick={() => setTab('youtube')}>YouTube</button>
        <button className={`chip ${tab === 'tips' ? 'sel' : ''}`} onClick={() => setTab('tips')}>Sugestões</button>
      </div>

      {tab === 'ai' && user.day >= 31 && (
        <div className="ai-banner">
          🌍 <strong>Fase {user.day > 60 ? 3 : 2} do plano:</strong> priorize <em>inglês de
          verdade</em> — vozes reais, velocidade real.{' '}
          <button className="linklike" onClick={() => setTab('youtube')}>
            Ir para a aba YouTube →
          </button>
          <span className="muted small"> (os diálogos de IA continuam aqui como aquecimento)</span>
        </div>
      )}
      {tab === 'ai' && <AiTab user={user} onMarked={refreshDay} />}
      {tab === 'youtube' && <YoutubeTab user={user} onMarked={refreshDay} />}
      {tab === 'tips' && <TipsTab onGoYoutube={() => setTab('youtube')} />}
    </div>
  );
}

function AiTab({ user, onMarked }: { user: User; onMarked: () => void }) {
  const { playOne, speakLines, stop, pause, resume, isPlaying, paused } = useSpeech();
  // Single source of truth with VoiceSettings: same localStorage key, and the
  // inline select writes back so the two controls never diverge.
  const [rate, setRateState] = useState(
    parseFloat(localStorage.getItem('fluencylab.voiceRate') ?? '') || 1
  );
  const setRate = (v: number) => {
    setRateState(v);
    localStorage.setItem('fluencylab.voiceRate', String(v));
  };
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState('');
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean | 'saving'>>({});
  const [err, setErr] = useState('');
  const [past, setPast] = useState<Dialogue[]>([]);
  const [showPt, setShowPt] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState<number | null>(null); // dialogue armed for deletion
  const [delBusy, setDelBusy] = useState(false);
  const dialogueRef = useRef<HTMLElement | null>(null);
  const scrollPendingRef = useRef(false);

  // Reopen a saved dialogue; the actual scroll happens after it renders (below).
  function openPast(d: Dialogue) {
    stop();
    setDialogue(d);
    setShowPt(false);
    scrollPendingRef.current = true;
  }

  // Once the reopened dialogue is in the DOM, bring it into view — it renders
  // above the list, so without this it can feel like nothing happened.
  useEffect(() => {
    if (scrollPendingRef.current && dialogue) {
      scrollPendingRef.current = false;
      dialogueRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [dialogue]);

  const loadPast = useCallback(async () => {
    try {
      setPast(await api.listDialogues(user.id));
    } catch {
      /* lista opcional */
    }
  }, [user.id]);
  useEffect(() => {
    stop();
    loadPast();
    return () => stop();
  }, [loadPast, stop]);

  async function run(fn: () => Promise<Dialogue>, label: string) {
    stop();
    setBusy(label);
    setErr('');
    setDialogue(null);
    setSaved({});
    try {
      const d = await fn();
      setDialogue(d);
      setShowPt(false);
      loadPast();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  }
  const generate = (t?: string) => {
    const th = (t ?? theme).trim();
    if (!th) return;
    setTheme('');
    run(() => api.generateDialogue(user.id, { theme: th }), 'gen');
  };
  const surprise = () => run(() => api.surpriseDialogue(user.id), 'surprise');

  function contextFor(idx: number) {
    if (!dialogue) return '';
    const lines = dialogue.lines;
    const fmt = (l: DialogueLine) => `${l.speaker}: ${l.en}`;
    if (idx > 0) return `${fmt(lines[idx - 1])}  ${fmt(lines[idx])}`;
    if (lines[idx + 1]) return `${fmt(lines[idx])}  ${fmt(lines[idx + 1])}`;
    return lines[idx].en;
  }
  async function savePhrase(line: DialogueLine, idx: number) {
    if (saved[idx]) return; // already saved or in flight
    setSaved((s) => ({ ...s, [idx]: 'saving' }));
    try {
      await api.savePhrase(user.id, { en: line.en, pt: line.pt, context: contextFor(idx) });
      setSaved((s) => ({ ...s, [idx]: true }));
    } catch (e) {
      setErr(errMsg(e));
      setSaved((s) => ({ ...s, [idx]: false }));
    }
  }

  return (
    <>
      <section className="card">
        <h2>Gerar um diálogo</h2>
        <p className="muted small">O Claude cria uma conversa de trabalho no seu nível; o navegador narra com 2 vozes.</p>
        <div className="row gen">
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Tema (ex: daily standup, negociação…)"
            onKeyDown={(e) => e.key === 'Enter' && generate()}
          />
          <button className="primary" onClick={() => generate()} disabled={!!busy || !theme.trim()}>
            {busy === 'gen' ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
        <div className="chips">
          <button className="chip surprise" disabled={!!busy} onClick={surprise}>
            {busy === 'surprise' ? 'Pensando…' : '🎲 Surpreenda-me'}
          </button>
          {THEMES.map((t) => (
            <button key={t} className="chip" disabled={!!busy} onClick={() => generate(t)}>{t}</button>
          ))}
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      {dialogue && (
        <section className="card" ref={dialogueRef}>
          <div className="row between">
            <h2>{dialogue.title}</h2>
            <div className="row">
              <select
                className="speed-select"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                title="Velocidade da narração"
              >
                <option value={0.6}>0.6×</option>
                <option value={0.75}>0.75×</option>
                <option value={0.9}>0.9×</option>
                <option value={1}>1×</option>
                <option value={1.15}>1.15×</option>
              </select>
              <button className="ghost" onClick={() => setShowPt((v) => !v)}>{showPt ? 'Ocultar PT' : 'Mostrar PT'}</button>
              {!isPlaying ? (
                <button
                  className="primary"
                  onClick={() =>
                    // The listen block only counts when the narration actually
                    // finishes — not on click (pressing ▶ and leaving is not studying).
                    speakLines(dialogue.lines, rate, () => {
                      api.markProgress(user.id, { block: 'listen' }).then(onMarked).catch(() => {});
                    })
                  }
                >▶ Ouvir tudo</button>
              ) : (
                <>
                  <button className="ghost" onClick={paused ? resume : pause}>{paused ? '▶ Retomar' : '⏸ Pausar'}</button>
                  <button className="danger-btn" onClick={stop}>⏹ Parar</button>
                </>
              )}
            </div>
          </div>
          <ul className="dialogue">
            {dialogue.lines.map((l, i) => (
              <li key={i} className={`line ${l.speaker === 'B' ? 'b' : 'a'}`}>
                <span className="spk">{l.speaker}</span>
                <div className="linebody">
                  <p className="en">{l.en}</p>
                  {showPt && <p className="muted small">{l.pt}</p>}
                </div>
                <div className="lineact">
                  <button className="ghost mini" onClick={() => playOne(l.en, { voiceIndex: l.speaker === 'B' ? 1 : 0, rate })}>🔊</button>
                  <button className="ghost mini" disabled={!!saved[i]} onClick={() => savePhrase(l, i)}>
                    {saved[i] === true ? '✓' : saved[i] === 'saving' ? '…' : '+ card'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="card">
          <h2>Diálogos anteriores</h2>
          <ul className="deck-list">
            {past.map((d) => (
              <li key={d.id}>
                <button className="linklike" onClick={() => openPast(d)}>{d.title}</button>
                <span className="row" style={{ gap: 8 }}>
                  {confirmDlg === d.id ? (
                    <>
                      <button className="ghost mini" onClick={() => setConfirmDlg(null)}>✕</button>
                      <button
                        className="danger-btn mini"
                        disabled={delBusy}
                        onClick={async () => {
                          if (delBusy) return;
                          setDelBusy(true);
                          setConfirmDlg(null);
                          await api.deleteDialogue(d.id, user.id).catch(() => {});
                          if (dialogue?.id === d.id) { stop(); setDialogue(null); }
                          await loadPast();
                          setDelBusy(false);
                        }}
                      >{delBusy ? '…' : 'Excluir?'}</button>
                    </>
                  ) : (
                    <>
                      <span className="muted small">{d.lines.length} falas</span>
                      <button
                        className="ghost mini del"
                        title="Excluir diálogo"
                        onClick={() => setConfirmDlg(d.id)}
                      >🗑</button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function YoutubeTab({ user, onMarked }: { user: User; onMarked: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [savedVideos, setSavedVideos] = useState<SavedYoutubeVideo[]>([]);
  const [confirmVid, setConfirmVid] = useState<number | null>(null); // saved video armed for deletion
  const [vidDelBusy, setVidDelBusy] = useState(false);
  const [opening, setOpening] = useState<number | null>(null); // saved video being reopened
  const [chunks, setChunks] = useState<TranscriptChunk[] | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean | 'saving'>>({});
  const [err, setErr] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [tx, setTx] = useState<Record<number, string>>({}); // translations by chunk index
  const [txLoading, setTxLoading] = useState<Record<number, boolean>>({});
  const [autoTx, setAutoTx] = useState(false); // translate the active line as it plays
  const [manual, setManual] = useState<Record<number, boolean>>({}); // lines the user revealed by hand

  const playerElRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const chunksRef = useRef<TranscriptChunk[] | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);
  const txReq = useRef<Set<number>>(new Set()); // indices already requested (avoid refetch)

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  const loadSavedVideos = useCallback(async () => {
    try {
      setSavedVideos(await api.listYoutubeVideos(user.id));
    } catch {
      /* lista opcional */
    }
  }, [user.id]);
  useEffect(() => {
    loadSavedVideos();
  }, [loadSavedVideos]);

  // Reset the per-video UI state (shared by load() and openSaved()).
  function resetVideoState() {
    setActiveIdx(-1);
    setSaved({});
    setTx({});
    setTxLoading({});
    setManual({});
    txReq.current = new Set();
  }

  async function load() {
    if (!url.trim()) return;
    setBusy(true);
    setErr('');
    setChunks(null);
    setVideoId(null);
    setVideoTitle(null);
    resetVideoState();
    try {
      const res = await api.youtube(user.id, { url: url.trim() });
      setVideoTitle(res.title);
      setChunks(res.chunks);
      setVideoId(res.videoId);
      loadSavedVideos();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Reopen a saved video from cache (instant — transcript comes from the DB).
  async function openSaved(v: SavedYoutubeVideo) {
    if (opening !== null) return;
    setOpening(v.id);
    setErr('');
    setChunks(null);
    setVideoId(null);
    setVideoTitle(null);
    resetVideoState();
    try {
      const res = await api.getYoutubeVideo(user.id, v.id);
      setVideoTitle(res.title);
      setChunks(res.chunks);
      setVideoId(res.videoId);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setOpening(null);
    }
  }

  // Create the player when a video loads; poll its time to highlight the line.
  // The listen block is only marked after ~60s of REAL playback (not on open).
  useEffect(() => {
    if (!videoId || !playerElRef.current) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let lastT = -1;
    let watchedMs = 0;
    let marked = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !playerElRef.current) return;
      playerRef.current = new YT.Player(playerElRef.current, {
        videoId,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            poll = setInterval(() => {
              const p = playerRef.current;
              const cs = chunksRef.current;
              if (!p?.getCurrentTime || !cs?.length) return;
              const t = p.getCurrentTime();
              // Time advanced since the last tick → the video is actually playing.
              if (lastT >= 0 && t > lastT && t - lastT < 3) watchedMs += 500;
              lastT = t;
              if (!marked && watchedMs >= 60_000) {
                marked = true;
                api.markProgress(user.id, { block: 'listen' }).then(onMarked).catch(() => {});
              }
              let idx = -1;
              for (let i = 0; i < cs.length; i++) {
                if (cs[i].offset <= t + 0.3) idx = i;
                else break;
              }
              setActiveIdx((prev) => (prev === idx ? prev : idx));
            }, 500);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
    };
    // `onMarked`/`user.id` intentionally omitted: they'd recreate the player on
    // every render (onMarked is a fresh closure each time). The player must live
    // for as long as the same video is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Keep the active line visible inside the transcript box (scrolls the box only).
  useEffect(() => {
    const box = listRef.current;
    const li = activeRef.current;
    if (!box || !li) return;
    const bt = box.getBoundingClientRect();
    const lt = li.getBoundingClientRect();
    if (lt.top < bt.top || lt.bottom > bt.bottom) {
      box.scrollTop += lt.top - bt.top - box.clientHeight / 2 + li.clientHeight / 2;
    }
  }, [activeIdx]);

  function seek(offset: number) {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(offset, true);
    p.playVideo();
  }

  // Translate one chunk (once) and cache it.
  async function fetchTx(i: number, text: string) {
    if (tx[i] !== undefined || txLoading[i]) return;
    setTxLoading((l) => ({ ...l, [i]: true }));
    try {
      const { pt } = await api.translate(text);
      setTx((t) => ({ ...t, [i]: pt }));
    } catch {
      /* tradução é opcional */
    } finally {
      setTxLoading((l) => {
        const n = { ...l };
        delete n[i];
        return n;
      });
    }
  }

  // Per-line 🌐: reveal/hide the translation by hand (keeps the cached text).
  function toggleTx(i: number, text: string) {
    const willShow = !manual[i];
    setManual((m) => ({ ...m, [i]: willShow }));
    if (willShow && !txReq.current.has(i)) {
      txReq.current.add(i);
      fetchTx(i, text);
    }
  }

  // With the toggle on, keep the current line and the next few translated ahead
  // of time, so the PT is ready by the time playback reaches each line.
  useEffect(() => {
    if (!autoTx || !chunks) return;
    const base = activeIdx < 0 ? 0 : activeIdx;
    for (let i = base; i <= base + LOOKAHEAD && i < chunks.length; i++) {
      if (!txReq.current.has(i)) {
        txReq.current.add(i);
        fetchTx(i, chunks[i].text);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, autoTx, chunks]);

  async function save(text: string, idx: number) {
    setSaved((s) => ({ ...s, [idx]: 'saving' }));
    try {
      await api.savePhrase(user.id, { en: text, context: 'YouTube' });
      setSaved((s) => ({ ...s, [idx]: true }));
    } catch (e) {
      setErr(errMsg(e));
      setSaved((s) => ({ ...s, [idx]: false }));
    }
  }

  return (
    <>
      <section className="card">
        <h2>Ouvir um vídeo do YouTube</h2>
        <p className="muted small">
          Cole a URL de um vídeo <strong>com legendas</strong>. O vídeo fica fixo e a transcrição
          acompanha — dá para traduzir cada fala e salvar frases. Os vídeos ficam guardados aqui
          embaixo.
        </p>
        <div className="row gen">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button className="primary" onClick={load} disabled={busy || !url.trim()}>
            {busy ? 'Carregando…' : 'Carregar'}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      {videoId && (
        <section className="card yt-player-card">
          {videoTitle && <h2 className="yt-title">{videoTitle}</h2>}
          <div className="yt-frame">
            <div key={videoId} ref={playerElRef} />
          </div>

          {chunks && (
            <>
              <div className="row between yt-transcript-head">
                <h2>Transcrição</h2>
                <label className="tx-toggle muted small">
                  <input
                    type="checkbox"
                    checked={autoTx}
                    onChange={(e) => setAutoTx(e.target.checked)}
                  />
                  🌐 traduzir enquanto toca
                </label>
              </div>
              <ul className="dialogue yt-transcript" ref={listRef}>
                {chunks.map((c, i) => {
                  const isActive = i === activeIdx;
                  return (
                    <li
                      key={i}
                      ref={isActive ? activeRef : null}
                      className={`line yt-line ${isActive ? 'active' : ''}`}
                    >
                      <button
                        className="ts-btn"
                        onClick={() => seek(c.offset)}
                        title="Pular para este ponto do vídeo"
                      >
                        {fmtTime(c.offset)}
                      </button>
                      <div className="linebody">
                        <p className="en">{c.text}</p>
                        {(manual[i] || (autoTx && i === activeIdx)) && (
                          <p className="tx-line">{tx[i] ?? 'traduzindo…'}</p>
                        )}
                      </div>
                      <div className="lineact">
                        <button
                          className="ghost mini"
                          title="Traduzir esta fala"
                          onClick={() => toggleTx(i, c.text)}
                        >
                          {txLoading[i] && tx[i] === undefined ? '…' : manual[i] ? '🌐✓' : '🌐'}
                        </button>
                        <button
                          className="ghost mini"
                          disabled={saved[i] === true || saved[i] === 'saving'}
                          onClick={() => save(c.text, i)}
                        >
                          {saved[i] === true ? '✓' : saved[i] === 'saving' ? '…' : '+ card'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {savedVideos.length > 0 && (
        <section className="card">
          <h2>Vídeos anteriores</h2>
          <ul className="deck-list">
            {savedVideos.map((v) => (
              <li key={v.id}>
                <button className="linklike" disabled={opening !== null} onClick={() => openSaved(v)}>
                  {opening === v.id ? '⏳ ' : ''}{v.title || v.videoId}
                </button>
                {confirmVid === v.id ? (
                  <span className="row" style={{ gap: 8 }}>
                    <button className="ghost mini" onClick={() => setConfirmVid(null)}>✕</button>
                    <button
                      className="danger-btn mini"
                      disabled={vidDelBusy}
                      onClick={async () => {
                        if (vidDelBusy) return;
                        setVidDelBusy(true);
                        setConfirmVid(null);
                        await api.deleteYoutubeVideo(v.id, user.id).catch(() => {});
                        await loadSavedVideos();
                        setVidDelBusy(false);
                      }}
                    >{vidDelBusy ? '…' : 'Excluir?'}</button>
                  </span>
                ) : (
                  <button
                    className="ghost mini del"
                    title="Remover vídeo"
                    onClick={() => setConfirmVid(v.id)}
                  >
                    🗑
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TipsTab({ onGoYoutube }: { onGoYoutube: () => void }) {
  return (
    <section className="card">
      <h2>Onde encontrar bom conteúdo</h2>
      <p className="muted small">
        Canais e sites recomendados. Copie a URL de um vídeo e cole na aba{' '}
        <button className="linklike" onClick={onGoYoutube}>YouTube</button> para ouvir com transcrição.
      </p>
      <ul className="deck-list">
        {SOURCES.map((s) => (
          <li key={s.name}>
            <a className="linklike" href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a>
            <span className="muted small">{s.desc}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
