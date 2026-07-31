// Minimal typings for the Web Speech API recognition side, which is not part of
// the standard lib.dom.d.ts. Kept module-scoped (not global) to avoid clashing
// with any future lib additions.

export interface SRAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
export interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SRAlternative;
}
export interface SRResultList {
  readonly length: number;
  readonly [index: number]: SRResult;
}
export interface SREvent {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
export interface SRErrorEvent {
  readonly error: string;
  readonly message: string;
}
export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

// Access the (possibly vendor-prefixed) constructor without augmenting Window.
export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
