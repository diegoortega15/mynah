import type {
  User,
  Deck,
  DeckCard,
  ReviewCard,
  Stats,
  Today,
  Dialogue,
  Recording,
  SpeechFeedback,
  Writing,
  WritingFeedback,
  HistoryDay,
  HistoryDetail,
  Rating,
  ShadowItem,
  TutorMessage,
  TranscriptChunk,
  SavedYoutubeVideo,
  YoutubeVideoData,
  VideoLevel,
  Channel,
  PlacementStep,
  PlacementResult,
  PlacementAnswer,
  PlacementRow,
  LevelHint,
  UserErrorsSummary,
  ComprehensionQuestion,
  RoleplayScenario,
  RoleplayEval,
  Reading,
  BlockKey,
} from './types';

interface ReqOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function req<T>(path: string, options: ReqOptions = {}): Promise<T> {
  const hasBody = options.body != null;
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      // Only send a JSON content-type when there is actually a body — Fastify
      // rejects an empty body when content-type is application/json (breaks DELETE).
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network-level failure (server down, offline) — raw fetch errors are in
    // English and cryptic; translate once here for every screen.
    throw new Error('Sem conexão com o servidor. Verifique se o app está rodando e tente de novo.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type Ok = { ok: boolean };

export const api = {
  listUsers: () => req<User[]>('/api/users'),
  getUser: (id: number | string) => req<User>(`/api/users/${id}`),
  createUser: (body: { name: string; level?: string; avatar?: string }) =>
    req<User>('/api/users', { method: 'POST', body }),
  updateUser: (
    id: number,
    body: Partial<Pick<User, 'name' | 'avatar' | 'level' | 'start_date'>> & {
      targets?: Partial<Record<BlockKey, number>>;
    }
  ) => req<User>(`/api/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: number) => req<Ok>(`/api/users/${id}`, { method: 'DELETE' }),
  profileStats: (id: number) =>
    req<{
      cards: number;
      reviews: number;
      writings: number;
      dialogues: number;
      speaking: number;
      levelTarget?: string;
    }>(`/api/users/${id}/profile-stats`),

  listDecks: (uid: number) => req<Deck[]>(`/api/users/${uid}/decks`),
  generatePack: (uid: number, body: { theme: string; count?: number }) =>
    req<{ deck_id: number; added: number }>(`/api/users/${uid}/decks/generate`, { method: 'POST', body }),
  deleteDeck: (id: number, uid: number) =>
    req<Ok>(`/api/decks/${id}?uid=${uid}`, { method: 'DELETE' }),
  deckCards: (deckId: number, uid: number) => req<DeckCard[]>(`/api/decks/${deckId}/cards?uid=${uid}`),
  deleteCard: (cardId: number, uid: number) =>
    req<Ok>(`/api/cards/${cardId}?uid=${uid}`, { method: 'DELETE' }),

  getReview: (uid: number) => req<ReviewCard[]>(`/api/users/${uid}/review`),
  getStats: (uid: number) => req<Stats>(`/api/users/${uid}/stats`),

  // Daily progress (4 blocks)
  today: (uid: number) => req<Today>(`/api/users/${uid}/today`),
  markProgress: (uid: number, body: { block: BlockKey }) =>
    req<Today>(`/api/users/${uid}/progress`, { method: 'POST', body }),

  // History
  history: (uid: number) => req<HistoryDay[]>(`/api/users/${uid}/history`),
  historyDay: (uid: number, date: string) => req<HistoryDetail>(`/api/users/${uid}/history/${date}`),
  submitReview: (cardId: number, rating: Rating, uid: number) =>
    req<{ ease: number; interval_days: number; reps: number; state: string; due_date: string }>(
      `/api/cards/${cardId}/review?uid=${uid}`,
      { method: 'POST', body: { rating } }
    ),

  // Writing
  correctWriting: (uid: number, body: { prompt?: string; text: string }) =>
    req<{ id: number; feedback: WritingFeedback }>(`/api/users/${uid}/writing`, { method: 'POST', body }),
  writingHistory: (uid: number) => req<Writing[]>(`/api/users/${uid}/writing`),
  getErrors: (uid: number) => req<UserErrorsSummary>(`/api/users/${uid}/errors`),

  // Listening
  generateDialogue: (uid: number, body: { theme: string }) =>
    req<Dialogue>(`/api/users/${uid}/listening/generate`, { method: 'POST', body }),
  surpriseDialogue: (uid: number) =>
    req<Dialogue>(`/api/users/${uid}/listening/surprise`, { method: 'POST', body: {} }),
  youtube: (uid: number, body: { url: string }) =>
    req<YoutubeVideoData & { id: number }>(`/api/users/${uid}/youtube`, { method: 'POST', body }),
  listYoutubeVideos: (uid: number) =>
    req<SavedYoutubeVideo[]>(`/api/users/${uid}/youtube-videos`),
  getYoutubeVideo: (uid: number, rowId: number) =>
    req<YoutubeVideoData>(`/api/users/${uid}/youtube-videos/${rowId}`),
  /** Translate one slice of a video's transcript (cache-first on the server). */
  translateVideoRange: (rowId: number, uid: number, from: number, to: number) =>
    req<{ from: number; pt: (string | null)[] }>(
      `/api/youtube-videos/${rowId}/translate?uid=${uid}`,
      { method: 'POST', body: { from, to } }
    ),
  /** Hand the server translations the browser produced on-device. */
  saveLocalTranslations: (items: { en: string; pt: string }[]) =>
    req<{ saved: number }>('/api/translations/local', { method: 'POST', body: { items } }),
  refreshTranscript: (uid: number, rowId: number) =>
    req<{ changed: boolean; chunks: TranscriptChunk[]; tx: (string | null)[]; fetchedAt: string }>(
      `/api/users/${uid}/youtube-videos/${rowId}/refresh`,
      { method: 'POST', body: {} }
    ),
  videoLevel: (uid: number, rowId: number) =>
    req<VideoLevel>(`/api/users/${uid}/youtube-videos/${rowId}/level`, { method: 'POST', body: {} }),
  deleteYoutubeVideo: (rowId: number, uid: number) =>
    req<Ok>(`/api/youtube-videos/${rowId}?uid=${uid}`, { method: 'DELETE' }),
  // Placement test: the server keeps the item bank and the answer key.
  placementStep: (answers: PlacementAnswer[], noAudio = false) =>
    req<PlacementStep | ({ done: true } & Omit<PlacementResult, 'id' | 'current' | 'differs'>)>(
      '/api/placement/step',
      { method: 'POST', body: { answers, noAudio } }
    ),
  savePlacement: (uid: number, answers: PlacementAnswer[]) =>
    req<PlacementResult>(`/api/users/${uid}/placement`, { method: 'POST', body: { answers } }),
  applyPlacement: (uid: number, pid: number) =>
    req<{ ok: true; level: string }>(`/api/users/${uid}/placement/${pid}/apply`, {
      method: 'POST',
      body: {},
    }),
  listPlacements: (uid: number) => req<PlacementRow[]>(`/api/users/${uid}/placements`),
  levelHint: (uid: number) => req<{ hint: LevelHint | null }>(`/api/users/${uid}/level-hint`),
  recordComprehension: (
    uid: number,
    body: { source: 'dialogue' | 'reading'; source_id?: number; cefr: string; correct: number; total: number }
  ) => req<Ok>(`/api/users/${uid}/comprehension`, { method: 'POST', body }),
  listChannels: (uid: number) => req<Channel[]>(`/api/users/${uid}/channels`),
  addChannel: (uid: number, body: { input: string; note?: string }) =>
    req<Channel & { already?: boolean }>(`/api/users/${uid}/channels`, { method: 'POST', body }),
  deleteChannel: (cid: number, uid: number) =>
    req<Ok>(`/api/channels/${cid}?uid=${uid}`, { method: 'DELETE' }),
  listDialogues: (uid: number) => req<Dialogue[]>(`/api/users/${uid}/listening`),
  deleteDialogue: (id: number, uid: number) =>
    req<Ok>(`/api/dialogues/${id}?uid=${uid}`, { method: 'DELETE' }),
  dialogueQuestions: (id: number, uid: number) =>
    req<{ questions: ComprehensionQuestion[] }>(`/api/dialogues/${id}/questions?uid=${uid}`, {
      method: 'POST',
      body: {},
    }),
  savePhrase: (uid: number, body: { en: string; pt?: string; context?: string }) =>
    req<{ phrase_id: number }>(`/api/users/${uid}/phrases`, { method: 'POST', body }),

  // Speaking
  tutor: (uid: number, body: { messages: TutorMessage[]; focus?: string }) =>
    req<{ reply: string }>(`/api/users/${uid}/tutor`, { method: 'POST', body }),
  logSpeaking: (
    uid: number,
    body: { mode: string; target?: string; transcript?: string; score?: number }
  ) => req<{ id: number }>(`/api/users/${uid}/speaking`, { method: 'POST', body }),
  shadowingGenerate: (uid: number, theme?: string) =>
    req<{ items: ShadowItem[] }>(`/api/users/${uid}/shadowing/generate`, { method: 'POST', body: { theme } }),
  translate: (text: string) => req<{ pt: string }>('/api/translate', { method: 'POST', body: { text } }),
  roleplayStart: (uid: number, theme?: string) =>
    req<RoleplayScenario>(`/api/users/${uid}/roleplay/start`, { method: 'POST', body: { theme } }),
  roleplayTurn: (uid: number, bodyArg: { messages: TutorMessage[]; scenario: Partial<RoleplayScenario> }) =>
    req<{ reply: string }>(`/api/users/${uid}/roleplay/turn`, { method: 'POST', body: bodyArg }),
  roleplayEvaluate: (
    uid: number,
    bodyArg: { messages: TutorMessage[]; scenario: Partial<RoleplayScenario> }
  ) => req<RoleplayEval>(`/api/users/${uid}/roleplay/evaluate`, { method: 'POST', body: bodyArg }),

  // Self-recordings
  listRecordings: (uid: number) => req<Recording[]>(`/api/users/${uid}/recordings`),
  deleteRecording: (id: number, uid: number) =>
    req<Ok>(`/api/recordings/${id}?uid=${uid}`, { method: 'DELETE' }),
  recordingUrl: (id: number, uid: number) => `/api/recordings/${id}/file?uid=${uid}`,
  saveTranscript: (id: number, transcript: string, uid: number) =>
    req<Ok>(`/api/recordings/${id}/transcript?uid=${uid}`, { method: 'POST', body: { transcript } }),
  analyzeRecording: (id: number, uid: number) =>
    req<SpeechFeedback>(`/api/recordings/${id}/analyze?uid=${uid}`, { method: 'POST', body: {} }),
  uploadRecording: async (uid: number, blob: Blob, kind: string, prompt: string) => {
    const q = `kind=${kind}&prompt=${encodeURIComponent(prompt || '')}`;
    const res = await fetch(`/api/users/${uid}/recordings?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': kind === 'audio' ? 'audio/webm' : 'video/webm' },
      body: blob,
    });
    if (!res.ok) throw new Error('falha ao enviar a gravação');
    return res.json() as Promise<{ id: number }>;
  },

  // Reading (extensive reading tab)
  generateReading: (uid: number, theme?: string) =>
    req<{ id: number; title: string; text: string; cefr?: string | null; questions?: ComprehensionQuestion[] }>(`/api/users/${uid}/reading/generate`, {
      method: 'POST',
      body: { theme },
    }),
  listReadings: (uid: number) => req<Reading[]>(`/api/users/${uid}/readings`),
  deleteReading: (id: number, uid: number) =>
    req<Ok>(`/api/readings/${id}?uid=${uid}`, { method: 'DELETE' }),
  readingQuestions: (id: number, uid: number) =>
    req<{ questions: ComprehensionQuestion[] }>(`/api/readings/${id}/questions?uid=${uid}`, {
      method: 'POST',
      body: {},
    }),
  lookup: (uid: number, word: string, sentence: string) =>
    req<{ pt: string }>(`/api/users/${uid}/lookup`, { method: 'POST', body: { word, sentence } }),

  // AI provider config (shape is dynamic → typed loosely)
  getConfig: () => req<any>('/api/config'),
  saveConfig: (body: unknown) => req<any>('/api/config', { method: 'PUT', body }),
  testConfig: (body: unknown) => req<{ ok: boolean; sample?: string }>('/api/config/test', { method: 'POST', body }),
};
