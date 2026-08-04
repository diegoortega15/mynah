// CEFR levels offered in the profile. Descriptions are in PT-BR because the
// point is to help the learner pick honestly — picking too high is the fastest
// way to make every exercise frustrating.
export interface LevelOption {
  code: string;
  name: string;
  hint: string;
}

export const LEVELS: LevelOption[] = [
  { code: 'A1', name: 'Iniciante', hint: 'Frases básicas: me apresentar, pedir algo, falar do meu dia com muito esforço.' },
  { code: 'A2', name: 'Básico', hint: 'Assuntos simples e rotineiros. Entendo se falarem devagar e com palavras comuns.' },
  { code: 'B1', name: 'Intermediário', hint: 'Me viro no trabalho e em viagens. Entendo o essencial, mas travo em conversa rápida.' },
  { code: 'B2', name: 'Intermediário alto', hint: 'Converso sobre temas técnicos com fluidez razoável. Entendo filmes com legenda em inglês.' },
  { code: 'C1', name: 'Avançado', hint: 'Me expresso com naturalidade, incluindo nuance e ironia. Reuniões sem esforço.' },
  { code: 'C2', name: 'Proficiente', hint: 'Domínio quase nativo: qualquer assunto, qualquer registro.' },
];

export const levelLabel = (code: string) => {
  const l = LEVELS.find((x) => x.code === code);
  return l ? `${l.code} · ${l.name}` : code;
};
