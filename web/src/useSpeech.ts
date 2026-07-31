import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getSpeechRecognition,
  type SpeechRecognitionInstance,
  type SREvent,
  type SRErrorEvent,
} from './speech-types';

const PREF_VOICE_KEY = 'fluencylab.voiceURI';
const PREF_RATE_KEY = 'fluencylab.voiceRate';

export interface Line {
  en: string;
  speaker?: string;
  pt?: string;
}
interface SpeakOpts {
  lang?: string;
  rate?: number;
  voiceIndex?: number;
}
interface DictationOpts {
  lang?: string;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
}

export interface SpeechContextValue {
  speak: (text: string, opts?: SpeakOpts) => Promise<void>;
  speakLines: (lines: Line[], rate?: number) => void;
  playOne: (text: string, opts?: { voiceIndex?: number; rate?: number }) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  listen: (opts?: { lang?: string }) => Promise<string>;
  stopListening: () => void;
  startDictation: (opts?: DictationOpts) => void;
  stopDictation: () => Promise<string>;
  dictating: boolean;
  enVoices: SpeechSynthesisVoice[];
  isPlaying: boolean;
  paused: boolean;
  ttsSupported: boolean;
  sttSupported: boolean;
}

// Score an English voice: prefer natural/neural/online voices over robotic ones.
function rankVoice(v: SpeechSynthesisVoice): number {
  const n = (v.name || '').toLowerCase();
  let s = 0;
  if (/natural|neural/.test(n)) s += 100;
  if (/online/.test(n)) s += 40;
  if (/google/.test(n)) s += 30;
  if (!v.localService) s += 20; // online voices are usually the good ones
  if (v.lang === 'en-US') s += 10;
  else if ((v.lang || '').startsWith('en')) s += 5;
  return s;
}

const SpeechContext = createContext<SpeechContextValue | null>(null);

// One shared speech engine for the whole app (Web Speech synthesis/recognition +
// MediaRecorder are global browser resources, so state must live in one place).
export function SpeechProvider({ children }: { children: ReactNode }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false); // an utterance is playing
  const [seqActive, setSeqActive] = useState(false); // a playback (single or sequence) is active
  const [paused, setPaused] = useState(false);
  const [dictating, setDictating] = useState(false); // continuous dictation is on
  const seqRef = useRef(0); // token to cancel an in-flight playback
  const queueRef = useRef<{ lines: Line[]; index: number; rate?: number } | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const dictTextRef = useRef(''); // accumulated final transcript while dictating
  const dictActiveRef = useRef(false); // true while the user wants to keep recording
  const dictResolveRef = useRef<((value: string) => void) | null>(null);
  const baseRef = useRef(''); // committed final text across auto-restarts

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);

  const enVoices = voices
    .filter((v) => v.lang && v.lang.startsWith('en'))
    .sort((a, b) => rankVoice(b) - rankVoice(a));

  // Speak one utterance; resolves when it ends (or is cancelled).
  const speak = useCallback(
    (text: string, { lang = 'en-US', rate, voiceIndex = 0 }: SpeakOpts = {}) =>
      new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) return resolve();
        const u = new SpeechSynthesisUtterance(text);

        // Precedence: explicit rate (inline control) > saved preference > default.
        const prefURI = localStorage.getItem(PREF_VOICE_KEY);
        const prefRate = parseFloat(localStorage.getItem(PREF_RATE_KEY) ?? '');
        u.lang = lang;
        u.rate = rate ?? (Number.isFinite(prefRate) ? prefRate : 0.95);

        const ranked = enVoices.length ? enVoices : voices;
        const primary = (prefURI && voices.find((v) => v.voiceURI === prefURI)) || ranked[0];
        const secondary = ranked.find((v) => v !== primary) || primary;
        const chosen = voiceIndex === 1 ? secondary : primary; // 2nd voice for speaker B
        if (chosen) u.voice = chosen;

        u.onstart = () => setSpeaking(true);
        u.onend = () => {
          setSpeaking(false);
          resolve();
        };
        u.onerror = () => {
          setSpeaking(false);
          resolve();
        };
        synth.speak(u);
      }),
    [voices, enVoices]
  );

  // Core playback: play `lines` from index `start`. Reliable pause/resume is
  // built on top of this by cancelling and replaying from the current line
  // (the native pause()/resume() is unreliable in Chrome).
  const playFrom = useCallback(
    (lines: Line[], start: number, rate?: number) => {
      const synth = window.speechSynthesis;
      if (!synth || !lines.length) return;
      synth.cancel();
      const token = ++seqRef.current;
      queueRef.current = { lines, index: start, rate };
      setSeqActive(true);
      setPaused(false);
      (async () => {
        for (let k = start; k < lines.length; k++) {
          if (seqRef.current !== token) return; // paused or stopped
          queueRef.current = { lines, index: k, rate };
          await speak(lines[k].en, { voiceIndex: lines[k].speaker === 'B' ? 1 : 0, rate });
        }
        if (seqRef.current === token) {
          setSeqActive(false);
          queueRef.current = null;
        }
      })();
    },
    [speak]
  );

  const speakLines = useCallback((lines: Line[], rate?: number) => playFrom(lines, 0, rate), [playFrom]);

  const playOne = useCallback(
    (text: string, { voiceIndex = 0, rate }: { voiceIndex?: number; rate?: number } = {}) =>
      playFrom([{ en: text, speaker: voiceIndex === 1 ? 'B' : 'A' }], 0, rate),
    [playFrom]
  );

  // Pause = stop now but remember the current line.
  const pause = useCallback(() => {
    if (!queueRef.current) return;
    seqRef.current++; // halt the loop, keep queueRef.index
    window.speechSynthesis?.cancel();
    setPaused(true);
    setSpeaking(false);
  }, []);

  // Resume = replay from the remembered line.
  const resume = useCallback(() => {
    const q = queueRef.current;
    if (q) playFrom(q.lines, q.index, q.rate);
  }, [playFrom]);

  const stop = useCallback(() => {
    seqRef.current++;
    window.speechSynthesis?.cancel();
    queueRef.current = null;
    setSeqActive(false);
    setSpeaking(false);
    setPaused(false);
  }, []);

  const cancel = stop; // backwards-compatible alias

  // Listen once and resolve with the transcript.
  const listen = useCallback(({ lang = 'en-US' }: { lang?: string } = {}) => {
    const SR = getSpeechRecognition();
    if (!SR) return Promise.reject(new Error('Reconhecimento de voz não suportado'));
    return new Promise<string>((resolve, reject) => {
      const r = new SR();
      recRef.current = r;
      r.lang = lang;
      r.interimResults = false;
      r.maxAlternatives = 1;
      let got: string | null = null;
      r.onresult = (e: SREvent) => (got = e.results[0][0].transcript);
      r.onerror = (e: SRErrorEvent) => reject(new Error(e.error || 'stt error'));
      r.onend = () => (got ? resolve(got) : reject(new Error('no-speech')));
      r.start();
    });
  }, []);

  const stopListening = useCallback(() => recRef.current?.stop(), []);

  // Continuous dictation: keeps listening through pauses (auto-restarting if the
  // browser ends the session) and only stops when the user sends. `onInterim`
  // receives the live text; `onError` fires if the mic is blocked.
  const startDictation = useCallback(({ lang = 'en-US', onInterim, onError }: DictationOpts = {}) => {
    const SR = getSpeechRecognition();
    if (!SR) throw new Error('Reconhecimento de voz não suportado');
    dictActiveRef.current = true;
    baseRef.current = '';
    dictTextRef.current = '';

    const make = () => {
      const r = new SR();
      recRef.current = r;
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e: SREvent) => {
        let finalT = '';
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalT += res[0].transcript + ' ';
          else interim += res[0].transcript;
        }
        if (finalT) baseRef.current += finalT;
        dictTextRef.current = baseRef.current.trim();
        if (onInterim) onInterim((baseRef.current + interim).trim());
      };
      r.onerror = (e: SRErrorEvent) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          dictActiveRef.current = false;
          setDictating(false);
          if (onError) onError('Permita o acesso ao microfone para falar.');
        }
      };
      r.onend = () => {
        if (dictActiveRef.current) {
          // Browser ended the session but the user is still recording → restart.
          try {
            r.start();
          } catch {
            try {
              make();
            } catch {
              /* give up quietly */
            }
          }
        } else if (dictResolveRef.current) {
          const res = dictResolveRef.current;
          dictResolveRef.current = null;
          res(dictTextRef.current.trim());
        }
      };
      r.start();
    };

    make();
    setDictating(true);
  }, []);

  // Stop dictation and resolve with the full accumulated transcript.
  const stopDictation = useCallback(
    () =>
      new Promise<string>((resolve) => {
        dictActiveRef.current = false;
        setDictating(false);
        const r = recRef.current;
        if (!r) return resolve(dictTextRef.current.trim());
        dictResolveRef.current = resolve;
        try {
          r.stop();
        } catch {
          /* onend/timeout will resolve */
        }
        // Safety net if onend never fires.
        setTimeout(() => {
          if (dictResolveRef.current) {
            const res = dictResolveRef.current;
            dictResolveRef.current = null;
            res(dictTextRef.current.trim());
          }
        }, 1200);
      }),
    []
  );

  const ttsSupported = typeof window !== 'undefined' && !!window.speechSynthesis;
  const sttSupported = typeof window !== 'undefined' && !!getSpeechRecognition();

  const value: SpeechContextValue = {
    speak,
    speakLines,
    playOne,
    stop,
    pause,
    resume,
    cancel,
    listen,
    stopListening,
    startDictation,
    stopDictation,
    dictating,
    enVoices,
    isPlaying: speaking || seqActive,
    paused,
    ttsSupported,
    sttSupported,
  };
  return createElement(SpeechContext.Provider, { value }, children);
}

// Consume the single shared speech engine.
export function useSpeech(): SpeechContextValue {
  const ctx = useContext(SpeechContext);
  if (!ctx) throw new Error('useSpeech deve ser usado dentro de <SpeechProvider>');
  return ctx;
}

// Rough pronunciation/accuracy score (0-100) comparing spoken vs target text.
export function similarity(target: string, spoken: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const a = norm(target).split(' ').filter(Boolean);
  const b = norm(spoken).split(' ').filter(Boolean);
  if (!a.length || !b.length) return 0;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  const dist = dp[a.length][b.length];
  return Math.max(0, Math.round((1 - dist / Math.max(a.length, b.length)) * 100));
}
