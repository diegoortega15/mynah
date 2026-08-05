// Item bank for the placement test.
//
// Deliberately hand-curated and FIXED rather than AI-generated: an AI writing
// the items would also be deciding what "B2" means, so the result would measure
// the model's opinion instead of the learner. Fixed items are also comparable
// across retakes — redoing the test on day 45 says something.
//
// Vocabulary is anchored to frequency bands (roughly: A1 = top 500 words,
// A2 = 500-1500, B1 = 1500-3000, B2 = 3000-5000, C1 = 5000-8000, C2 = beyond),
// which is a real anchor rather than a judgement call.

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const idxOf = (cefr) => LEVELS.indexOf(cefr);

// --- Block 1: vocabulary breadth (LexTALE-style yes/no) -------------------
// The made-up words are the point: they catch someone answering "I know it" to
// everything. Without them a yes/no vocabulary test scores confidence, not
// knowledge. They are pronounceable and English-shaped on purpose.
export const VOCAB = [
  { w: 'water', level: 'A1' },
  { w: 'happy', level: 'A1' },
  { w: 'school', level: 'A1' },
  { w: 'borrow', level: 'A2' },
  { w: 'weather', level: 'A2' },
  { w: 'careful', level: 'A2' },
  { w: 'afford', level: 'B1' },
  { w: 'reliable', level: 'B1' },
  { w: 'deadline', level: 'B1' },
  { w: 'thorough', level: 'B2' },
  { w: 'blunt', level: 'B2' },
  { w: 'sustain', level: 'B2' },
  { w: 'cumbersome', level: 'C1' },
  { w: 'mitigate', level: 'C1' },
  { w: 'ubiquitous', level: 'C2' },
  { w: 'perfunctory', level: 'C2' },
  { w: 'brellow', fake: true },
  { w: 'tunkish', fake: true },
  { w: 'swampet', fake: true },
  { w: 'flomber', fake: true },
  { w: 'graskle', fake: true },
  { w: 'vundle', fake: true },
];

// --- Block 2: listening --------------------------------------------------
// `speak` is narrated by the browser's speech synthesis (local and free), so
// this block costs nothing to run. Text length and speed of thought — not just
// vocabulary — are what separate the levels here.
export const LISTENING = [
  {
    id: 'l-a1',
    level: 'A1',
    speak: 'My name is Ana. I am from Brazil. I work in a small shop near my house.',
    q: 'Onde a Ana trabalha?',
    options: ['Numa loja pequena perto de casa', 'Num escritório no centro', 'Em casa, pela internet'],
    answer: 0,
  },
  {
    id: 'l-a2',
    level: 'A2',
    speak:
      'I usually take the bus to work, but this morning it was raining a lot, so I asked my brother for a ride.',
    q: 'Como a pessoa foi trabalhar hoje?',
    options: ['De ônibus, como sempre', 'De carona com o irmão', 'A pé, debaixo de chuva'],
    answer: 1,
  },
  {
    id: 'l-b1',
    level: 'B1',
    speak:
      'We were supposed to launch on Friday, but the client asked for two more features. I told my manager we can either keep the date and cut something, or move the launch to the following week.',
    q: 'O que a pessoa propôs ao gerente?',
    options: [
      'Lançar na sexta e entregar tudo o que o cliente pediu',
      'Escolher entre cortar algo ou adiar o lançamento',
      'Recusar o pedido do cliente',
    ],
    answer: 1,
  },
  {
    id: 'l-b1b',
    level: 'B1',
    speak:
      'I have been learning English for years, on and off. The problem was never grammar — it was that I could read fine but freeze completely the moment someone spoke to me.',
    q: 'Qual era a dificuldade da pessoa?',
    options: ['Gramática', 'Ler em inglês', 'Travar quando alguém fala com ela'],
    answer: 2,
  },
  {
    id: 'l-b2',
    level: 'B2',
    speak:
      "To be honest, the numbers look good on paper, but I'd rather we held off until the audit comes back. If it turns out we've been over-reporting, announcing now would put us in an awkward spot.",
    q: 'O que a pessoa quer fazer?',
    options: [
      'Anunciar os números agora, porque estão bons',
      'Esperar a auditoria antes de anunciar',
      'Refazer os números antes da auditoria',
    ],
    answer: 1,
  },
  {
    id: 'l-b2b',
    level: 'B2',
    speak:
      "She's brilliant, don't get me wrong — but she has a habit of taking on far more than she can handle and then going quiet about it until the deadline is already blown.",
    q: 'Qual é a crítica feita a ela?',
    options: [
      'Ela não é competente',
      'Ela assume trabalho demais e some até o prazo estourar',
      'Ela reclama demais dos prazos',
    ],
    answer: 1,
  },
  {
    id: 'l-c1',
    level: 'C1',
    speak:
      "I wouldn't say the project failed, exactly. It just quietly stopped being anyone's priority, and by the time we noticed, half the team had been reassigned and nobody wanted to be the one to call it.",
    q: 'O que aconteceu com o projeto?',
    options: [
      'Foi cancelado oficialmente pela diretoria',
      'Foi definitivamente um fracasso técnico',
      'Foi sendo esvaziado sem ninguém assumir o encerramento',
    ],
    answer: 2,
  },
  {
    id: 'l-c2',
    level: 'C2',
    speak:
      "There's a certain irony in a company that preaches radical transparency running its most consequential decisions through a channel nobody outside the founding team has ever been invited to.",
    q: 'Qual é a ironia apontada?',
    options: [
      'A empresa prega transparência mas decide o mais importante num círculo fechado',
      'A empresa é transparente demais para o próprio bem',
      'Os fundadores discordam entre si sobre transparência',
    ],
    answer: 0,
  },
];

// --- Block 3: gap fill (grammar and collocation in context) ---------------
export const CLOZE = [
  { id: 'c-a1', level: 'A1', text: 'She ___ to work every day.', options: ['go', 'goes', 'going'], answer: 1 },
  { id: 'c-a1b', level: 'A1', text: 'There ___ two cars outside.', options: ['is', 'are', 'be'], answer: 1 },
  { id: 'c-a2', level: 'A2', text: 'I ___ lunch when you called.', options: ['have', 'was having', 'had have'], answer: 1 },
  { id: 'c-a2b', level: 'A2', text: 'This coffee is ___ than the other one.', options: ['gooder', 'more good', 'better'], answer: 2 },
  { id: 'c-b1', level: 'B1', text: "If I ___ more time, I'd redo the whole thing.", options: ['have', 'had', 'would have'], answer: 1 },
  { id: 'c-b1b', level: 'B1', text: "I'm looking forward ___ you next week.", options: ['to meet', 'to meeting', 'meeting'], answer: 1 },
  { id: 'c-b1c', level: 'B1', text: "We've been working on it ___ March.", options: ['since', 'for', 'during'], answer: 0 },
  { id: 'c-b2', level: 'B2', text: 'The report needs ___ before Friday.', options: ['to review', 'reviewing', 'be reviewed'], answer: 1 },
  { id: 'c-b2b', level: 'B2', text: "He'd rather we ___ the client today.", options: ['call', 'called', 'would call'], answer: 1 },
  { id: 'c-b2c', level: 'B2', text: 'They ___ a solid case for the delay.', options: ['did', 'made', 'took'], answer: 1 },
  { id: 'c-c1', level: 'C1', text: 'Not until the audit closed ___ how bad it was.', options: ['we realised', 'did we realise', 'we did realise'], answer: 1 },
  { id: 'c-c1b', level: 'C1', text: 'She takes everything he says ___ a grain of salt.', options: ['with', 'by', 'under'], answer: 0 },
  { id: 'c-c2', level: 'C2', text: 'Had we known, we ___ differently.', options: ['would act', 'would have acted', 'had acted'], answer: 1 },
  { id: 'c-c2b', level: 'C2', text: 'The decision, ___ questionable, was at least consistent.', options: ['however', 'albeit', 'despite'], answer: 1 },
];
