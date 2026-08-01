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
  created_at?: string;
  day: number;
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
}
export interface Stats {
  due: number;
  total: number;
  reviewedToday: number;
}

export interface DialogueLine {
  speaker: 'A' | 'B';
  en: string;
  pt: string;
}
export interface Dialogue {
  id: number;
  theme?: string;
  title: string;
  lines: DialogueLine[];
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
  created_at: string;
}

export interface ShadowItem {
  en: string;
  pt: string;
}
export interface TutorMessage {
  role: 'user' | 'tutor';
  text: string;
}
