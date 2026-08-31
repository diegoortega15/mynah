import { describe, it, expect } from 'vitest';
import { nextStep, scoreVocab, scorePlacement, LISTENING_ITEMS, CLOZE_ITEMS } from '../lib/placement.js';
import { VOCAB, LISTENING, CLOZE } from '../lib/placementBank.js';

const real = (level) => VOCAB.filter((v) => v.level === level).map((v) => v.w);
const upTo = (level) => {
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return order.slice(0, order.indexOf(level) + 1).flatMap(real);
};
// Answer a listening/cloze item the way a learner at `level` plausibly would:
// right when the item is at or below them, wrong above.
const answerAs = (item, level) => {
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const can = order.indexOf(item.level) <= order.indexOf(level);
  return { id: item.id, value: can ? item.answer : (item.answer + 1) % item.options.length };
};

/** Run the whole adaptive test as a learner of the given level. */
function simulate(level) {
  const answers = [{ id: 'vocab', known: upTo(level) }];
  for (let i = 0; i < 40; i++) {
    const step = nextStep(answers);
    if (step.done) return step;
    const pool = step.item.block === 'listening' ? LISTENING : CLOZE;
    const full = pool.find((it) => it.id === step.item.id);
    answers.push(answerAs(full, level));
  }
  throw new Error('o teste não terminou');
}

describe('bloco de vocabulário', () => {
  it('marcar palavras inventadas invalida o bloco em vez de premiar o chute', () => {
    const everything = VOCAB.map((v) => v.w); // disse conhecer tudo, inclusive o que não existe
    const r = scoreVocab(everything);
    expect(r.cefr).toBeNull();
    expect(r.reason).toBe('chute');
  });

  it('reconhece a faixa mais alta que a pessoa realmente domina', () => {
    expect(scoreVocab(upTo('A2')).cefr).toBe('A2');
    expect(scoreVocab(upTo('B2')).cefr).toBe('B2');
    expect(scoreVocab(upTo('C2')).cefr).toBe('C2');
  });

  it('não conhecer nada devolve o nível mais baixo, não um erro', () => {
    expect(scoreVocab([]).cefr).toBe('A1');
  });

  it('um chute isolado numa palavra falsa não invalida o bloco', () => {
    const r = scoreVocab([...upTo('B1'), 'brellow']);
    expect(r.cefr).toBe('B1');
    expect(r.reason).toBeNull();
  });
});

describe('fluxo adaptativo', () => {
  it('começa pelo vocabulário', () => {
    const step = nextStep([]);
    expect(step.item.block).toBe('vocab');
    expect(step.item.words).toHaveLength(VOCAB.length);
    expect(new Set(step.item.words)).toEqual(new Set(VOCAB.map((v) => v.w)));
  });

  it('embaralha as palavras — em ordem de banco as inventadas ficam todas no fim', () => {
    const bankOrder = VOCAB.map((v) => v.w).join();
    // 10 sorteios: a chance de todos saírem na ordem original é desprezível.
    const runs = Array.from({ length: 10 }, () => nextStep([]).item.words.join());
    expect(runs.some((r) => r !== bankOrder)).toBe(true);
  });

  it('nunca manda a resposta certa junto com a pergunta', () => {
    const step = nextStep([{ id: 'vocab', known: [] }]);
    expect(step.item.block).toBe('listening');
    expect(step.item).not.toHaveProperty('answer');
    expect(JSON.stringify(step.item)).not.toContain('"answer"');
  });

  it('sobe de nível quando acerta e desce quando erra', () => {
    const first = nextStep([{ id: 'vocab', known: [] }]).item;
    const item = LISTENING.find((i) => i.id === first.id);

    const afterRight = nextStep([{ id: 'vocab', known: [] }, { id: item.id, value: item.answer }]).item;
    const afterWrong = nextStep([
      { id: 'vocab', known: [] },
      { id: item.id, value: (item.answer + 1) % item.options.length },
    ]).item;

    const lv = (id) => LISTENING.find((i) => i.id === id).level;
    const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    expect(order.indexOf(lv(afterRight.id))).toBeGreaterThan(order.indexOf(lv(afterWrong.id)));
  });

  it('nunca repete um item', () => {
    const answers = [{ id: 'vocab', known: upTo('B1') }];
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const step = nextStep(answers);
      if (step.done) break;
      expect(seen.has(step.item.id)).toBe(false);
      seen.add(step.item.id);
      const pool = step.item.block === 'listening' ? LISTENING : CLOZE;
      answers.push(answerAs(pool.find((it) => it.id === step.item.id), 'B1'));
    }
  });

  it('termina depois do número previsto de itens', () => {
    const r = simulate('B1');
    expect(r.done).toBe(true);
    expect(r.blocks.listeningTotal).toBe(LISTENING_ITEMS);
    expect(r.blocks.clozeTotal).toBe(CLOZE_ITEMS);
  });
});

describe('navegador sem voz em inglês', () => {
  // Sem voz em inglês, narrar o bloco de escuta usaria uma voz portuguesa lendo
  // inglês: o aluno responderia ruído e o teste reportaria um nível que nunca
  // mediu. Melhor tirar o bloco e dizer isso do que inventar uma nota.
  it('não faz nenhuma pergunta de escuta', () => {
    const answers = [{ id: 'vocab', known: upTo('B1') }];
    for (let i = 0; i < 40; i++) {
      const step = nextStep(answers, { noAudio: true });
      if (step.done) {
        expect(step.blocks.listeningTotal).toBe(0);
        expect(step.blocks.listening).toBeNull();
        expect(step.blocks.clozeTotal).toBe(CLOZE_ITEMS);
        return;
      }
      expect(step.item.block).not.toBe('listening');
      answers.push(answerAs(CLOZE.find((it) => it.id === step.item.id), 'B1'));
    }
    throw new Error('o teste não terminou');
  });

  it('desconta os itens de escuta do total mostrado ao aluno', () => {
    expect(nextStep([], { noAudio: true }).total).toBe(1 + CLOZE_ITEMS);
    expect(nextStep([]).total).toBe(1 + LISTENING_ITEMS + CLOZE_ITEMS);
  });

  it('ainda dá um veredito, pelos blocos que sobraram', () => {
    const answers = [{ id: 'vocab', known: upTo('B2') }];
    let step;
    for (let i = 0; i < 40 && !(step = nextStep(answers, { noAudio: true })).done; i++) {
      answers.push(answerAs(CLOZE.find((it) => it.id === step.item.id), 'B2'));
    }
    expect(['B1', 'B2', 'C1']).toContain(step.cefr);
  });
});

describe('resultado final', () => {
  // O teste só vale se discriminar: um A1 e um C1 não podem sair no mesmo lugar.
  it('separa alunos de níveis diferentes', () => {
    const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const got = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => order.indexOf(simulate(l).cefr));
    for (let i = 1; i < got.length; i++) {
      expect(got[i]).toBeGreaterThanOrEqual(got[i - 1]);
    }
    expect(got[got.length - 1]).toBeGreaterThan(got[0]);
  });

  it('não erra por mais de um degrau em relação ao nível simulado', () => {
    const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    for (const level of order) {
      const r = simulate(level);
      expect(Math.abs(order.indexOf(r.cefr) - order.indexOf(level))).toBeLessThanOrEqual(1);
    }
  });

  it('ignora o bloco de vocabulário quando ele foi chutado', () => {
    const answers = [{ id: 'vocab', known: VOCAB.map((v) => v.w) }];
    for (let i = 0; i < 40; i++) {
      const step = nextStep(answers);
      if (step.done) {
        expect(step.blocks.vocabNoise).toBe(true);
        expect(step.blocks.vocab).toBeNull();
        expect(step.cefr).toBeTruthy(); // ainda dá um veredito, pelos outros blocos
        break;
      }
      const pool = step.item.block === 'listening' ? LISTENING : CLOZE;
      answers.push(answerAs(pool.find((it) => it.id === step.item.id), 'A2'));
    }
  });

  it('não quebra com respostas vazias', () => {
    const r = scorePlacement([]);
    expect(r.cefr).toBe('A1');
  });
});

describe('sanidade do banco de itens', () => {
  it('todo item tem uma resposta válida', () => {
    for (const it of [...LISTENING, ...CLOZE]) {
      expect(it.options[it.answer]).toBeTruthy();
      expect(it.options).toHaveLength(3);
    }
  });

  it('os ids são únicos', () => {
    const ids = [...LISTENING, ...CLOZE].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('há itens suficientes para o teste inteiro', () => {
    expect(LISTENING.length).toBeGreaterThanOrEqual(LISTENING_ITEMS);
    expect(CLOZE.length).toBeGreaterThanOrEqual(CLOZE_ITEMS);
  });

  it('a resposta certa não é sempre a mesma posição', () => {
    const spread = new Set([...LISTENING, ...CLOZE].map((i) => i.answer));
    expect(spread.size).toBeGreaterThan(1);
  });
});
