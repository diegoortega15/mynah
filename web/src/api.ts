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
  BlockKey,
} from './types';

interface ReqOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function req<T>(path: string, options: ReqOptions = {}): Promise<T> {
  const hasBody = options.body != null;
  const res = await fetch(path, {
    ...options,
    // Only send a JSON content-type when there is actually a body — Fastify
    // rejects an empty body when content-type is application/json (breaks DELETE).
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type Ok = { ok: boolean };

export const api = {
  listUsers: () => req<User[]>('/api/users'),
  getUser: (id: number | string) => req<User>(`/api/users/${id}`),
  createUser: (body: { name: string; level?: string; avatar?: string }) =>
    req<User>('/api/users', { method: 'POST', body }),
  updateUser: (id: number, body: Partial<Pick<User, 'name' | 'avatar' | 'level' | 'start_date'>>) =>
    req<User>(`/api/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: number) => req<Ok>(`/api/users/${id}`, { method: 'DELETE' }),
  profileStats: (id: number) =>
    req<{ cards: number; reviews: number; writings: number; dialogues: number; speaking: number }>(
      `/api/users/${id}/profile-stats`
    ),

  listDecks: (uid: number) => req<Deck[]>(`/api/users/${uid}/decks`),
  generatePack: (uid: number, body: { theme: string; count?: number }) =>
    req<{ deck_id: number; added: number }>(`/api/users/${uid}/decks/generate`, { method: 'POST', body }),
  deleteDeck: (id: number) => req<Ok>(`/api/decks/${id}`, { method: 'DELETE' }),
  deckCards: (deckId: number) => req<DeckCard[]>(`/api/decks/${deckId}/cards`),
  deleteCard: (cardId: number) => req<Ok>(`/api/cards/${cardId}`, { method: 'DELETE' }),

  getReview: (uid: number) => req<ReviewCard[]>(`/api/users/${uid}/review`),
  getStats: (uid: number) => req<Stats>(`/api/users/${uid}/stats`),

  // Daily progress (4 blocks)
  today: (uid: number) => req<Today>(`/api/users/${uid}/today`),
  markProgress: (uid: number, body: { block: BlockKey }) =>
    req<Today>(`/api/users/${uid}/progress`, { method: 'POST', body }),

  // History
  history: (uid: number) => req<HistoryDay[]>(`/api/users/${uid}/history`),
  historyDay: (uid: number, date: string) => req<HistoryDetail>(`/api/users/${uid}/history/${date}`),
  submitReview: (cardId: number, rating: Rating) =>
    req<{ ease: number; interval_days: number; reps: number; state: string; due_date: string }>(
      `/api/cards/${cardId}/review`,
      { method: 'POST', body: { rating } }
    ),

  // Writing
  correctWriting: (uid: number, body: { prompt?: string; text: string }) =>
    req<{ id: number; feedback: WritingFeedback }>(`/api/users/${uid}/writing`, { method: 'POST', body }),
  writingHistory: (uid: number) => req<Writing[]>(`/api/users/${uid}/writing`),

  // Listening
  generateDialogue: (uid: number, body: { theme: string }) =>
    req<Dialogue>(`/api/users/${uid}/listening/generate`, { method: 'POST', body }),
  surpriseDialogue: (uid: number) =>
    req<Dialogue>(`/api/users/${uid}/listening/surprise`, { method: 'POST', body: {} }),
  youtube: (uid: number, body: { url: string }) =>
    req<{ id: number; videoId: string; title: string | null; chunks: TranscriptChunk[] }>(
      `/api/users/${uid}/youtube`,
      { method: 'POST', body }
    ),
  listYoutubeVideos: (uid: number) =>
    req<SavedYoutubeVideo[]>(`/api/users/${uid}/youtube-videos`),
  getYoutubeVideo: (uid: number, rowId: number) =>
    req<{ videoId: string; title: string | null; chunks: TranscriptChunk[] }>(
      `/api/users/${uid}/youtube-videos/${rowId}`
    ),
  deleteYoutubeVideo: (rowId: number) => req<Ok>(`/api/youtube-videos/${rowId}`, { method: 'DELETE' }),
  listDialogues: (uid: number) => req<Dialogue[]>(`/api/users/${uid}/listening`),
  deleteDialogue: (id: number) => req<Ok>(`/api/dialogues/${id}`, { method: 'DELETE' }),
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

  // Self-recordings
  listRecordings: (uid: number) => req<Recording[]>(`/api/users/${uid}/recordings`),
  deleteRecording: (id: number) => req<Ok>(`/api/recordings/${id}`, { method: 'DELETE' }),
  recordingUrl: (id: number) => `/api/recordings/${id}/file`,
  saveTranscript: (id: number, transcript: string) =>
    req<Ok>(`/api/recordings/${id}/transcript`, { method: 'POST', body: { transcript } }),
  analyzeRecording: (id: number) => req<SpeechFeedback>(`/api/recordings/${id}/analyze`, { method: 'POST', body: {} }),
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

  // AI provider config (shape is dynamic → typed loosely)
  getConfig: () => req<any>('/api/config'),
  saveConfig: (body: unknown) => req<any>('/api/config', { method: 'PUT', body }),
  testConfig: (body: unknown) => req<{ ok: boolean; sample?: string }>('/api/config/test', { method: 'POST', body }),
};
