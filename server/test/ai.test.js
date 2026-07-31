import { describe, it, expect } from 'vitest';
import { extractJson } from '../services/ai.js';

describe('extractJson()', () => {
  it('parses a raw JSON object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a ```json fenced block', () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('extracts an array from surrounding prose', () => {
    expect(extractJson('Sure! [{"en":"hi"}] — enjoy')).toEqual([{ en: 'hi' }]);
  });
});
