// Shared domain types (mirror the backend responses).

export type BlockKey = 'listen' | 'vocab' | 'speak' | 'write';
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface Phase {
  n: number;
  name: string;
  range: string;
}
export interface Milestone {
  day: number;
  label: string;
  reached?: boolean;
}
export interface User {
  id: number;
  name: string;
  avatar: string;
  level: string;
  start_date: string;
  streak: number;
  longest_streak: number;
  last_active: string | null;
  freezes: number;
  targets: Partial<Record<BlockKey, number>> | null;
  /** Idade — impõe restrições de conteúdo apropriadas por si só. */
  age: number | null;
  /** Sobre o que o conteúdo deve ser (padrão: trabalho/carreira/tecnologia). */
  focus: string | null;
  /** Temas que a IA nunca deve escrever. */
  avoid_topics: string | null;
  created_at?: string;
  /** Dia do PLANO: conta dias estudados, não dias corridos. */
  day: number;
  /** Dias de calendário desde o início — mostrado ao lado, para não esconder o tempo. */
  elapsedDays: number;
  studiedDays: number;
  skippedDays: number;
  phase: Phase;
  todayFocus: string;
  nextMilestone: Milestone | null;
  milestones: Milestone[];
}

export interface Deck {
  id: number;
  user_id?: number;
  name: string;
  theme?: string;
  created_at?: string;
  card_count: number;
}
export interface DeckCard {
  card_id: number;
  state: string;
  due_date: string;
  reps: number;
  phrase_id: number;
  text_en: string;
  translation_pt: string;
  context: string;
}
export interface ReviewCard {
  card_id: number;
  state: string;
  reps: number;
  due_date: string;
  text_en: string;
  translation_pt: string;
  context: string;
  deck_name: string;
  /** Quantos dias cada nota adiaria ESTE card — mostrado no tooltip do botão. */
  preview?: Record<Rating, number>;
}
/** Um card que saiu da fila de revisão, e por quê. */
export interface PausedCard {
  card_id: number;
  paused_reason: 'leech' | 'mastered';
  paused_at: string;
  lapses: number;
  interval_days: number;
  text_en: string;
  translation_pt: string;
  deck_name: string;
}

/** Quantos cards vencem em cada um dos próximos 14 dias. */
export interface LoadDay {
  date: string;
  count: number;
}

export interface Stats {
  due: number;
  total: number;
  reviewedToday: number;
  /** Próxima data com cards, quando a fila de hoje está vazia. */
  nextDue?: string | null;
  nextCount?: number;
}

export interface DialogueLine {
  speaker: 'A' | 'B';
  en: string;
  pt: string;
}
export interface ComprehensionQuestion {
  q: string;
  options: string[];
  answer: number; // index of the correct option
  why: string;
}
export interface Dialogue {
  id: number;
  theme?: string;
  title: string;
  lines: DialogueLine[];
  questions?: ComprehensionQuestion[]; // empty on dialogues created before this feature
  cefr?: string | null; // level it was generated at; null before levels were recorded
  created_at?: string;
}

export interface BlockStatus {
  done: boolean;
  count?: number;
  info: string;
}
export interface Today {
  date: string;
  blocks: Record<BlockKey, BlockStatus>;
  doneCount: number;
  total: number;
  complete: boolean;
  targets?: Record<BlockKey, number>;
  justCompleted?: boolean;
}

export interface Correction {
  original: string;
  better: string;
  why: string;
}
export interface SpeechFeedback {
  comment: string;
  strengths: string[];
  improvements: string[];
  corrections: Correction[];
  score: number;
}
export interface Recording {
  id: number;
  kind: string;
  mime: string;
  prompt: string;
  transcript: string;
  feedback: SpeechFeedback | null;
  created_at: string;
}

export interface WritingError {
  original: string;
  correction: string;
  explanation: string;
  category?: string;
}

export interface UserErrorEntry {
  id: number;
  source: 'writing' | 'speaking';
  original: string;
  correction: string;
  explanation: string | null;
  category: string | null;
  created_at: string;
}
export interface UserErrorsSummary {
  top: { category: string; count: number }[];
  recent: UserErrorEntry[];
}
export interface WritingFeedback {
  corrected: string;
  errors: WritingError[];
  rewrite: string;
  comment: string;
}
export interface Writing {
  id: number;
  prompt: string;
  user_text: string;
  feedback: WritingFeedback | null;
  created_at: string;
}

export interface HistoryDay {
  date: string;
  blocks: Record<BlockKey, boolean>;
  doneCount: number;
  complete: boolean;
}
export interface HistoryDetail {
  date: string;
  blocks: Record<BlockKey, BlockStatus>;
  activity: {
    cardsReviewed: number;
    dialogues: string[];
    writings: number;
    speaking: number;
  };
}

export interface TranscriptChunk {
  text: string;
  offset: number; // start time in whole seconds
}

export interface SavedYoutubeVideo {
  id: number;
  videoId: string;
  title: string | null;
  cefr?: string | null;
  created_at: string;
}

/** How a video's difficulty compares to the learner's level. Never blocks — just informs. */
export interface LevelGap {
  cefr: string;
  mine: string;
  delta: number;
  harder: boolean;
  /** True when the content sits exactly on the learner's level. */
  match: boolean;
  msg: string;
}

export interface VideoLevel {
  cefr: string;
  why: string | null;
  gap: LevelGap | null;
}

export type TxSource = 'ai' | 'local';

export interface YoutubeVideoData {
  id?: number;
  videoId: string;
  title: string | null;
  chunks: TranscriptChunk[];
  /** Cached translations aligned with chunks; null where not translated yet. */
  tx: (string | null)[];
  /** Where each translation came from: 'ai', or 'local' for a browser stopgap. */
  txSource: (TxSource | null)[];
  fetchedAt: string | null;
  level: VideoLevel | null;
}

// --- Placement test -------------------------------------------------------
// Items arrive WITHOUT the answer key — grading happens on the server.
export type PlacementItem =
  | { block: 'vocab'; id: 'vocab'; words: string[] }
  | { block: 'listening'; id: string; speak: string; q: string; options: string[] }
  | { block: 'cloze'; id: string; text: string; options: string[] };

export interface PlacementStep {
  done: false;
  step: number;
  total: number;
  item: PlacementItem;
}

export interface PlacementBlocks {
  vocab: string | null;
  vocabNoise: boolean;
  listening: string | null;
  listeningRight: number;
  listeningTotal: number;
  cloze: string | null;
  clozeRight: number;
  clozeTotal: number;
}

export interface PlacementResult {
  id: number;
  cefr: string;
  blocks: PlacementBlocks;
  current: string;
  differs: boolean;
}

/** A past test, kept so day 45 can be compared with day 1. */
export interface PlacementRow {
  id: number;
  result_cefr: string;
  blocks: PlacementBlocks;
  applied: number;
  created_at: string;
}

export interface PlacementAnswer {
  id: string;
  value?: number;
  known?: string[];
}

/** Evidence from day-to-day quizzes disagreeing with the profile's level. */
export interface LevelHint {
  direction: 'up' | 'down';
  suggested: string;
  current: string;
  samples: number;
  msg: string;
}

/** A YouTube channel the learner marked as a favourite hunting ground. */
export interface Channel {
  id: number;
  name: string;
  url: string;
  note: string | null;
  created_at?: string;
}

export interface Reading {
  id: number;
  theme: string;
  title: string;
  text_en: string;
  questions?: ComprehensionQuestion[]; // empty on readings created before this feature
  cefr?: string | null; // level it was generated at; null before levels were recorded
  created_at: string;
}

export interface RoleplayScenario {
  title: string;
  scenario: string;
  ai_role: string;
  objective: string;
  opening: string;
}
export interface RoleplayEval {
  achieved: boolean;
  score: number;
  feedback: string;
  better_phrases: { original: string; better: string; why: string; category?: string }[];
}

export interface ShadowItem {
  en: string;
  pt: string;
}
export interface TutorMessage {
  role: 'user' | 'tutor';
  text: string;
}
