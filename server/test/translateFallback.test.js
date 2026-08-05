import { describe, it, expect, beforeEach, vi } from 'vitest';

// The whole point of this file: prove that a dead AI degrades into "no
// translation for this line" instead of an exception, so the browser's
// on-device translator can fill the gap — and that it gives up fast instead of
// burning one CLI timeout per line.
vi.mock('../services/ai.js', () => ({
  translatePhrase: vi.fn(),
  translateBatch: vi.fn(),
}));

const { db } = await import('../db.js');
const { translateList, translateOne, putLocal, getRow } = await import('../lib/translations.js');
const ai = await import('../services/ai.js');

const LINES = Array.from({ length: 25 }, (_, i) => `line number ${i}`);

describe('quando a IA está fora do ar', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM translations').run();
    vi.clearAllMocks();
  });

  it('devolve nulls em vez de estourar', async () => {
    ai.translateBatch.mockRejectedValue(new Error('claude timeout'));
    ai.translatePhrase.mockRejectedValue(new Error('claude timeout'));

    const out = await translateList(LINES);
    expect(out).toHaveLength(LINES.length);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('desiste rápido: não tenta uma vez por linha', async () => {
    ai.translateBatch.mockRejectedValue(new Error('down'));
    ai.translatePhrase.mockRejectedValue(new Error('down'));

    await translateList(LINES);
    // Com o provedor fora, cada tentativa custa um timeout inteiro. Duas falhas
    // seguidas bastam para concluir que está fora — não 25.
    expect(ai.translatePhrase.mock.calls.length).toBeLessThanOrEqual(3);
    expect(ai.translateBatch.mock.calls.length).toBe(1);
  });

  it('mantém o remendo local em vez de devolver nada', async () => {
    putLocal([{ en: LINES[0], pt: 'linha número 0' }]);
    ai.translateBatch.mockRejectedValue(new Error('down'));
    ai.translatePhrase.mockRejectedValue(new Error('down'));

    const out = await translateList(LINES);
    expect(out[0]).toBe('linha número 0');
    expect(out[1]).toBeNull();
  });

  it('translateOne devolve o remendo local quando a IA falha', async () => {
    putLocal([{ en: 'hello there', pt: 'olá' }]);
    ai.translatePhrase.mockRejectedValue(new Error('down'));
    await expect(translateOne('hello there')).resolves.toBe('olá');
  });

  it('translateOne propaga o erro quando não há remendo nenhum', async () => {
    ai.translatePhrase.mockRejectedValue(new Error('down'));
    await expect(translateOne('never seen')).rejects.toThrow('down');
  });
});

describe('quando a IA volta', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM translations').run();
    vi.clearAllMocks();
  });

  it('reescreve as linhas que estavam marcadas como locais', async () => {
    putLocal([{ en: LINES[0], pt: 'tradução ruim do navegador' }]);
    ai.translateBatch.mockImplementation(async (texts) => texts.map((t) => `IA: ${t}`));

    const out = await translateList(LINES.slice(0, 3));
    expect(out[0]).toBe(`IA: ${LINES[0]}`);
    expect(getRow(LINES[0])).toMatchObject({ source: 'ai' });
  });

  it('não gasta IA de novo em linhas que ela já traduziu', async () => {
    ai.translateBatch.mockImplementation(async (texts) => texts.map((t) => `IA: ${t}`));
    await translateList(LINES.slice(0, 3));
    vi.clearAllMocks();

    const again = await translateList(LINES.slice(0, 3));
    expect(again[0]).toBe(`IA: ${LINES[0]}`);
    expect(ai.translateBatch).not.toHaveBeenCalled();
    expect(ai.translatePhrase).not.toHaveBeenCalled();
  });
});
