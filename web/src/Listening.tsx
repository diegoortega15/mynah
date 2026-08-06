import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useSpeech } from './useSpeech.js';
import DayBanner from './DayBanner.jsx';
import HelpTip from './HelpTip.jsx';
import { fmtAgo } from './format.js';
import ComprehensionQuiz from './ComprehensionQuiz.jsx';
import FavoriteChannels, { useChannels } from './FavoriteChannels.jsx';
import { localTranslateSupported, translateLocally } from './localTranslate.js';
import { useToday, useRefreshDay } from './queries.js';
import type {
  User,
  Dialogue,
  DialogueLine,
  TranscriptChunk,
  SavedYoutubeVideo,
  YoutubeVideoData,
  VideoLevel,
  TxSource,
} from './types';

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

// Lines per translation request. Must match BATCH on the server, where the size
// was measured: ten lines per AI call is ~3.6x cheaper per line than one-by-one.
const BATCH = 10;

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
  const [qBusy, setQBusy] = useState(false);
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

          {dialogue.questions && dialogue.questions.length > 0 ? (
            <ComprehensionQuiz
              key={dialogue.id}
              questions={dialogue.questions}
              userId={user.id}
              source="dialogue"
              sourceId={dialogue.id}
              cefr={dialogue.cefr}
            />
          ) : (
            // Dialogue created before the feature: generate on demand.
            <div className="row end" style={{ marginTop: 12 }}>
              <button
                className="ghost mini"
                disabled={qBusy}
                onClick={async () => {
                  if (qBusy) return;
                  setQBusy(true);
                  try {
                    const { questions } = await api.dialogueQuestions(dialogue.id, user.id);
                    setDialogue((d) => (d ? { ...d, questions } : d));
                    loadPast();
                  } catch (e) {
                    setErr(errMsg(e));
                  } finally {
                    setQBusy(false);
                  }
                }}
              >
                {qBusy ? 'Criando perguntas…' : '✅ Gerar perguntas de compreensão'}
              </button>
            </div>
          )}
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
                      <span className="muted small">
                        {d.created_at ? `${fmtAgo(d.created_at)} · ` : ''}
                        {d.lines.length} falas
                      </span>
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
  const [rowId, setRowId] = useState<number | null>(null); // DB row of the open video
  const [chunks, setChunks] = useState<TranscriptChunk[] | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean | 'saving'>>({});
  const [err, setErr] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  // Translations aligned with chunks (null = not translated yet). Seeded from the
  // server cache, so a video you already translated opens instantly translated.
  const [tx, setTx] = useState<(string | null)[]>([]);
  const [txSource, setTxSource] = useState<(TxSource | null)[]>([]);
  const [txLoading, setTxLoading] = useState<Record<number, boolean>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [autoTx, setAutoTx] = useState(false); // show the translation under the active line
  const [manual, setManual] = useState<Record<number, boolean>>({}); // lines the user revealed by hand
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [level, setLevel] = useState<VideoLevel | null>(null);
  const [levelBusy, setLevelBusy] = useState(false);
  const chan = useChannels(user.id);
  const [chanMsg, setChanMsg] = useState('');
  const [usedLocal, setUsedLocal] = useState(false); // the on-device fallback kicked in

  const playerElRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const chunksRef = useRef<TranscriptChunk[] | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);
  const bulkRun = useRef(0); // bumped to cancel an in-flight bulk translation

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
    setTx([]);
    setTxLoading({});
    setManual({});
    setBulk(null);
    setLevel(null);
    setRefreshMsg('');
    bulkRun.current++; // cancels any bulk translation still running
  }

  // Adopt a video payload (fresh load, reopen or refreshed transcript).
  function adopt(res: YoutubeVideoData) {
    setChunks(res.chunks);
    setTx(res.tx ?? res.chunks.map(() => null));
    setTxSource(res.txSource ?? res.chunks.map(() => null));
    setFetchedAt(res.fetchedAt);
    setLevel(res.level);
  }

  /**
   * Fill gaps the AI could not translate using the browser's on-device
   * translator, and hand the result back to the server cache so it survives a
   * reload. Marked 'local': the next AI run rewrites it.
   */
  async function fillLocally(from: number, pt: (string | null)[], all: TranscriptChunk[]) {
    const gaps = pt.map((v, k) => (v ? -1 : from + k)).filter((i) => i >= 0);
    if (!gaps.length || !localTranslateSupported()) return;

    const local = await translateLocally(gaps.map((i) => all[i].text));
    const done = gaps
      .map((i, k) => ({ i, pt: local[k] }))
      .filter((x): x is { i: number; pt: string } => !!x.pt);
    if (!done.length) return;

    setTx((prev) => {
      const next = [...prev];
      done.forEach(({ i, pt: v }) => (next[i] = v));
      return next;
    });
    setTxSource((prev) => {
      const next = [...prev];
      done.forEach(({ i }) => (next[i] = 'local'));
      return next;
    });
    setUsedLocal(true);
    api.saveLocalTranslations(done.map(({ i, pt: v }) => ({ en: all[i].text, pt: v }))).catch(() => {
      /* o cache é otimização: a tradução já está na tela */
    });
  }

  // Judge the video's level in the background — never delays getting to the video.
  const askLevel = useCallback(
    async (id: number) => {
      setLevelBusy(true);
      try {
        setLevel(await api.videoLevel(user.id, id));
      } catch {
        /* o aviso de nível é um extra: sem ele o vídeo funciona igual */
      } finally {
        setLevelBusy(false);
      }
    },
    [user.id]
  );

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
      setRowId(res.id);
      adopt(res);
      setVideoId(res.videoId);
      loadSavedVideos();
      if (!res.level) askLevel(res.id);
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
      setRowId(v.id);
      adopt(res);
      setVideoId(res.videoId);
      if (!res.level) askLevel(v.id);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setOpening(null);
    }
  }

  // Re-fetch the caption track: YouTube captions do get edited and auto-captions
  // are re-generated, which would make click-to-seek land on the wrong moment.
  async function refreshTranscript() {
    if (!rowId || refreshing) return;
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await api.refreshTranscript(user.id, rowId);
      setChunks(res.chunks);
      setTx(res.tx ?? res.chunks.map(() => null));
      setFetchedAt(res.fetchedAt);
      setManual({});
      setActiveIdx(-1);
      bulkRun.current++;
      setBulk(null);
      if (res.changed) {
        setLevel(null);
        askLevel(rowId);
        setRefreshMsg('A legenda deste vídeo mudou — atualizei a transcrição e os tempos.');
      } else {
        setRefreshMsg('A legenda continua igual à que estava salva.');
      }
    } catch (e) {
      setRefreshMsg(errMsg(e));
    } finally {
      setRefreshing(false);
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

  // Translate one line on demand (the 🌐 button). Goes through the same server
  // cache as the bulk pass, so a line translated here is never paid for twice.
  async function fetchTx(i: number) {
    if (!rowId || tx[i] || txLoading[i]) return;
    setTxLoading((l) => ({ ...l, [i]: true }));
    try {
      const { pt } = await api.translateVideoRange(rowId, user.id, i, i + 1);
      if (pt[0]) {
        setTx((t) => t.map((v, k) => (k === i ? pt[0] : v)));
        setTxSource((s) => s.map((v, k) => (k === i ? 'ai' : v)));
      } else if (chunks) {
        await fillLocally(i, pt, chunks);
      }
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
  function toggleTx(i: number) {
    const willShow = !manual[i];
    setManual((m) => ({ ...m, [i]: willShow }));
    if (willShow) fetchTx(i);
  }

  /**
   * Translate the whole video in batches, filling lines in as they land.
   * One AI call per BATCH instead of one per line — measured on the Claude CLI,
   * that is ~7x cheaper per line, because most of the cost is process start-up.
   * Anything already cached on the server comes back instantly and costs nothing.
   */
  async function translateAll() {
    if (!rowId || !chunks) return;
    const run = ++bulkRun.current;
    const total = chunks.length;
    const already = tx.filter(Boolean).length;
    if (already === total) return; // vídeo já traduzido: nem pisca a barra
    setBulk({ done: already, total });

    for (let from = 0; from < total; from += BATCH) {
      if (bulkRun.current !== run) return; // toggle turned off / another video opened
      const to = Math.min(total, from + BATCH);
      // Skip a batch that is already fully translated (reopening a done video).
      if (tx.slice(from, to).every(Boolean)) {
        setBulk({ done: Math.min(to, total), total });
        continue;
      }
      try {
        const res = await api.translateVideoRange(rowId, user.id, from, to);
        if (bulkRun.current !== run) return;
        setTx((prev) => {
          const next = [...prev];
          res.pt.forEach((p, k) => {
            if (p) next[res.from + k] = p;
          });
          return next;
        });
        setTxSource((prev) => {
          const next = [...prev];
          res.pt.forEach((p, k) => {
            if (p) next[res.from + k] = 'ai';
          });
          return next;
        });
        // Whatever the AI could not do, the browser tries on-device.
        await fillLocally(res.from, res.pt, chunks);
      } catch {
        /* um lote que falha não derruba o resto */
      }
      setBulk({ done: Math.min(to, total), total });
    }
    if (bulkRun.current === run) setBulk(null);
  }

  // Turning the toggle on translates the video once; turning it off cancels.
  function toggleAutoTx(on: boolean) {
    setAutoTx(on);
    if (on) translateAll();
    else {
      bulkRun.current++;
      setBulk(null);
    }
  }

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

      <FavoriteChannels ctl={chan} />

      {videoId && (
        <section className="card yt-player-card">
          <div className="row between yt-title-row">
            {videoTitle && <h2 className="yt-title">{videoTitle}</h2>}
            <button
              className="ghost mini"
              disabled={chan.busy}
              title="Salvar o canal deste vídeo nos meus canais"
              onClick={async () => {
                const m = await chan.add(`https://www.youtube.com/watch?v=${videoId}`);
                if (m) setChanMsg(m);
              }}
            >
              {chan.busy ? '…' : '⭐ salvar canal'}
            </button>
          </div>
          {chanMsg && <p className="muted small">{chanMsg}</p>}

          {level?.gap ? (
            <p
              className={`level-note ${level.gap.match ? 'match' : level.gap.harder ? 'harder' : 'easier'}`}
            >
              <strong>{level.gap.cefr}</strong> {level.gap.msg}
              {level.why && <span className="muted small"> — {level.why}</span>}
            </p>
          ) : (
            // Never leave this spot blank while thinking: an empty spot reads as
            // "the feature is broken", which is the doubt this whole note exists
            // to remove.
            levelBusy && <p className="level-note muted small">⏳ Avaliando o nível deste vídeo…</p>
          )}

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
                    onChange={(e) => toggleAutoTx(e.target.checked)}
                  />
                  🌐 mostrar tradução
                </label>
              </div>

              {(usedLocal || txSource.includes('local')) && (
                <p className="tx-local-note">
                  ⚠️ Parte da tradução veio do <strong>tradutor do próprio navegador</strong>, porque
                  a IA não respondeu. Ele escreve bem, mas erra o que depende de contexto — marque
                  🌐 de novo quando a IA voltar e essas linhas são refeitas.
                </p>
              )}

              {bulk && (
                <div className="tx-progress">
                  <div className="bar">
                    <div style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }} />
                  </div>
                  <p className="muted small">
                    Traduzindo {bulk.done}/{bulk.total} — a primeira vez leva alguns minutos, depois
                    fica salvo e abre na hora. Pode assistir enquanto traduz.
                  </p>
                </div>
              )}
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
                        <button
                          className="en yt-seek"
                          onClick={() => seek(c.offset)}
                          title={`Pular para ${fmtTime(c.offset)}`}
                        >
                          {c.text}
                        </button>
                        {(manual[i] || (autoTx && i === activeIdx)) && (
                          <p className={`tx-line ${txSource[i] === 'local' ? 'local' : ''}`}>
                            {tx[i] ?? 'traduzindo…'}
                            {txSource[i] === 'local' && (
                              <span
                                className="tx-flag"
                                title="Traduzido pelo navegador (a IA estava fora) — pode errar o contexto"
                              >
                                {' '}
                                ⚠️
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="lineact">
                        <button
                          className="ghost mini"
                          title="Traduzir esta fala"
                          onClick={() => toggleTx(i)}
                        >
                          {txLoading[i] ? '…' : manual[i] ? '🌐✓' : '🌐'}
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

              <div className="row between yt-foot">
                <span className="muted small">
                  {fetchedAt ? `Legenda capturada ${fmtAgo(fetchedAt)}.` : 'Legenda salva antes desta versão.'}
                </span>
                <button
                  className="ghost mini"
                  disabled={refreshing}
                  title="Rebuscar a legenda no YouTube — legendas são editadas e regeradas, e uma legenda antiga faz o clique pular para o momento errado"
                  onClick={refreshTranscript}
                >
                  {refreshing ? 'Buscando…' : '🔄 atualizar transcrição'}
                </button>
              </div>
              {refreshMsg && <p className="muted small">{refreshMsg}</p>}
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
                <span className="muted small">{fmtAgo(v.created_at)}</span>
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
