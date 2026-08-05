import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db.js';
import { keyOf, getCached, putCached } from '../lib/translations.js';
import { levelGap } from '../lib/level.js';

describe('cache de traduções (chaveado pelo texto)', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM translations').run();
  });

  it('acha a tradução independentemente de espaços em volta', () => {
    putCached('Hello there', 'Olá');
    expect(getCached('  Hello   there  ')).toBe('Olá');
  });

  it('a mesma frase em vídeos diferentes é a mesma chave', () => {
    expect(keyOf('We can finish on time.')).toBe(keyOf('We can finish on time.'));
    expect(keyOf('We can finish on time.')).not.toBe(keyOf('We can finish on Time.'));
  });

  it('devolve null quando não conhece a frase', () => {
    expect(getCached('never seen before')).toBeNull();
  });

  it('regravar a mesma frase atualiza em vez de duplicar', () => {
    putCached('Take care', 'Se cuida');
    putCached('Take care', 'Cuide-se');
    expect(getCached('Take care')).toBe('Cuide-se');
    expect(db.prepare('SELECT COUNT(*) c FROM translations').get().c).toBe(1);
  });

  it('ignora entradas vazias', () => {
    putCached('  ', 'algo');
    putCached('algo', '   ');
    expect(db.prepare('SELECT COUNT(*) c FROM translations').get().c).toBe(0);
  });
});

describe('levelGap (aviso de nível do vídeo)', () => {
  it('cala a boca quando o vídeo está no nível do aluno', () => {
    expect(levelGap('B1', 'B1')).toBeNull();
  });

  it('marca como mais difícil e mede a distância em degraus CEFR', () => {
    expect(levelGap('B2', 'B1')).toMatchObject({ delta: 1, harder: true });
    expect(levelGap('C1', 'A2')).toMatchObject({ delta: 3, harder: true });
  });

  it('marca como mais fácil', () => {
    expect(levelGap('A2', 'B1')).toMatchObject({ delta: -1, harder: false });
  });

  it('entende os rótulos antigos em português', () => {
    expect(levelGap('B2', 'Intermediário')).toMatchObject({ mine: 'B1', delta: 1 });
  });

  it('devolve null para um nível que não existe', () => {
    expect(levelGap('Z9', 'B1')).toBeNull();
    expect(levelGap(null, 'B1')).toBeNull();
  });
});
