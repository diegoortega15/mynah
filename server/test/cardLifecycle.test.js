import { describe, it, expect } from 'vitest';
import { pauseAfterReview, LEECH_LAPSES, MASTERED_DAYS } from '../lib/cardLifecycle.js';

const card = (over = {}) => ({ interval_days: 5, lapses: 0, ...over });

describe('sair da fila — cards problemáticos (leech)', () => {
  it('pausa depois de errar demais o mesmo card', () => {
    expect(pauseAfterReview(card({ lapses: LEECH_LAPSES }), 'again')).toEqual({ reason: 'leech' });
  });

  it('não pausa antes disso', () => {
    expect(pauseAfterReview(card({ lapses: LEECH_LAPSES - 1 }), 'again')).toBeNull();
  });

  // Um card com 8 erros não está dominado, por mais longo que o intervalo tenha
  // ficado — insistir nele é justamente o que se quer evitar.
  it('erro demais ganha de intervalo longo', () => {
    const r = pauseAfterReview(card({ lapses: LEECH_LAPSES, interval_days: 300 }), 'easy');
    expect(r).toEqual({ reason: 'leech' });
  });
});

describe('sair da fila — cards dominados', () => {
  it('aposenta ao passar do horizonte do plano com resposta confiante', () => {
    expect(pauseAfterReview(card({ interval_days: MASTERED_DAYS }), 'good')).toEqual({
      reason: 'mastered',
    });
    expect(pauseAfterReview(card({ interval_days: 120 }), 'easy')).toEqual({ reason: 'mastered' });
  });

  it('não aposenta logo abaixo do limite', () => {
    expect(pauseAfterReview(card({ interval_days: MASTERED_DAYS - 1 }), 'good')).toBeNull();
  });

  // Chegar a 60 dias apertando "Custou" é aritmética do agendador, não prova de
  // que a pessoa sabe a frase.
  it('não aposenta quem respondeu "Errei" ou "Custou"', () => {
    expect(pauseAfterReview(card({ interval_days: 200 }), 'hard')).toBeNull();
    expect(pauseAfterReview(card({ interval_days: 200 }), 'again')).toBeNull();
  });
});

describe('caso comum', () => {
  it('um card normal continua na fila', () => {
    for (const rating of ['again', 'hard', 'good', 'easy']) {
      expect(pauseAfterReview(card(), rating)).toBeNull();
    }
  });

  it('aguenta card sem os campos preenchidos', () => {
    expect(pauseAfterReview({}, 'good')).toBeNull();
  });
});
