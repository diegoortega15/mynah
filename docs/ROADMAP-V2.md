# Mynah — Plano de Ação v2 (revisão de usabilidade + engenharia)

> Síntese de 3 revisões independentes (ago/2026): método de aprendizagem × ciência de SLA e concorrentes (Anki/FSRS, LingQ, Language Reactor, Migaku, Speak, Loora, Elsa, Clozemaster), auditoria de UX, e code review de arquitetura/DX.
> Complementa o `IMPROVEMENTS.md` (rodada 1, já absorvida).
>
> **Decisões do usuário (ago/2026):** executar na ordem A→B→C→D; migrar SM-2→FSRS; incluir todas as frentes da Fase D; streak com freeze semanal.

## Veredito geral

- **Método**: o núcleo está certo (input compreensível + output, frases em contexto, shadowing, streak honesto). Os buracos: SM-2 obsoleto (FSRS ≈ 25% menos revisões), revisão só por reconhecimento (falta retrieval produtivo), sem leitura extensiva, nível fixo (sem i+1), feedback de escrita que não vira prática deliberada.
- **UX**: base sólida, mas: só tema escuro; exclusões sem confirmação; bloco "Ouvir" marca como feito só de abrir; rascunhos se perdem ao navegar; erros técnicos crus na tela; IA sem indicador de saúde; mobile com navegação só por emoji.
- **Engenharia**: acima da média para o porte. Restam 4 riscos reais (P0): testes tocando o banco real, falta de checagem de dono (multiusuário), vídeo lido inteiro em memória, promessas sem tratamento na revisão.

---

## FASE A — Correções críticas (eng P0 + quick wins UX) · ~1-2 dias

Engenharia:
- [x] Caminho do DB injetável (`DB_PATH`/`:memory:`) e testes isolados do banco real
- [x] Checagem de dono (`user_id`) nas rotas de delete/leitura: recordings (primeiro), decks, cards, dialogues, youtube_videos
- [x] `GET /recordings/:id/file`: streaming sempre (matar `readFileSync`), validar Range (416)
- [x] try/catch em `rate()`/`startReview()`/`loadDecks()` no Vocab (falha de rede não pode travar a revisão)

UX quick wins (<1h cada):
- [x] Confirmação inline nas exclusões (card, diálogo, vídeo, gravação) — padrão do deck
- [x] "Ouvir" só conta ao TERMINAR a narração; nunca ao abrir vídeo salvo
- [x] Persistir rascunho do Writing + conversa do Tutor em localStorage
- [x] Labels sob os ícones da bottom bar + `safe-area-inset-bottom`
- [x] Área de toque ≥40px nos botões mini; separar o 🗑 dos demais
- [x] Velocidade de voz: fonte única (Listening lê a mesma chave do VoiceSettings)
- [x] Erros de IA amigáveis em PT + "Tentar de novo" (parar de vazar `detail` técnico — junto com o item de eng abaixo)

## FASE B — Tema claro + primeiro uso + DX de quem baixa · ~2-3 dias

- [x] **Tema claro/escuro/auto**: tokens derivados (`--good-tint`, `--accent-tint`, `--shadow`, `--on-accent`), bloco `:root[data-theme="light"]`, `color-scheme`, toggle 3 estados em Settings, persistência + aplicação pré-paint, meta theme-color dinâmica
- [x] **Onboarding**: seed "Primeiros passos" (12 frases estáticas) na criação do perfil. *(Parcial: em vez do passo "Testar IA" no onboarding, ficou o banner de saúde da IA no Dashboard — cobre o mesmo risco; o CTA "Comece por aqui" do dia 1 ficou pro backlog.)*
- [x] **DX**: README com quickstart da raiz (`npm i && npm run install:all && npm run dev`); `npm run seed` (perfil demo + baralho + diálogo estáticos); banner "IA não configurada" no primeiro load (usa `/api/config/test`); `engines` no package.json
- [x] Higiene de erros no server: mensagens por categoria, código único `ai_failed`, sem `e.message` pro cliente
- [x] `POST /config/test` sem persistir antes de testar; transação no `POST review`; índices no schema (FKs + `cards.due_date`); JSON Schema nas rotas de escrita (Swagger vira doc real)

## FASE C — Núcleo de aprendizagem · ~3-5 dias

- [x] **SM-2 → FSRS** (`ts-fsrs`): mesmos 4 botões, ~25% menos revisões; migração dos cards existentes
- [x] **Modos de revisão variados** (interleaving): reconhecimento (atual) + cloze em contexto + PT→EN + áudio→transcrição
- [x] **Banco de erros recorrentes**: toda correção (escrita/fala) salva erros categorizados; painel "seus top 5 erros"; alimenta prompts do tutor/escrita (Fase 3 do plano de 90 dias promete isso)
- [x] **Streak flexível**: freeze ganho por semana completa (ou streak "≥1 bloco" separado do perfeito) — decisão do usuário
- [x] Metas configuráveis por perfil (cards/dia, práticas, textos, diálogos) — o "modo 30min" é reduzir as metas; o dia de descanso é coberto pelo freeze semanal

## FASE D — Novas frentes de estudo · ~1-2 semanas (incremental)

- [x] **Aba Ler** (leitura extensiva, estilo LingQ): textos gerados no nível dinâmico, lookup 1-clique (palavra no contexto da frase), "+ card" salva a frase. *(Colar artigo próprio ficou pro backlog.)*
- [x] **Roleplay com objetivo** (estilo Loora/Speak): cenários com meta ("convença o gerente a adiar o deadline"), rubrica ao final, correção leve durante / detalhada no resumo
- [x] **Técnica 4/3/2** no Speaking: mesma história 3× com tempo decrescente, comparação entre takes
- [x] **Nível dinâmico (i+1)**: inferir CEFR-alvo pelo desempenho (accuracy dos cards, notas de escrita, uso do "Mostrar PT") e subir a dificuldade dos prompts ao longo dos 90 dias
- [x] Transição forçada p/ conteúdo autêntico a partir do dia 31 (meta de listening no YouTube/podcast)

## Backlog (P2)

- Whisper local p/ shadowing (confidências por palavra) + drills de pronúncia PT-BR (th/t, -ed, h aspirado)
- Onboarding: passo "Testar IA" + CTA "Comece por aqui" no dia 1; colar artigo próprio na aba Ler
- Contexto cruzado entre blocos do dia (tutor cita o diálogo da manhã; escrita usa 3 cards do dia)
- i18n PT/EN da interface; PWA + lembrete diário; exportar cards (CSV/Anki) e backup
- Testes front (`similarity()` primeiro, depois `req()` e ReviewSession); testes de providers com mock
- Módulo de queries compartilhado (JOIN quádruplo repetido); cap no histórico do tutor; `targets` do server no front

## Armadilhas a evitar (dos revisores)

- Correção excessiva no speaking mata a fluência — corrigir leve durante, detalhado só no fim
- IA gerando tudo = input "monocultura corporativa limpa" — empurrar YouTube/podcast progressivamente
- Métricas de vaidade — os marcos 30/60/90 devem ser TESTADOS (roleplay avaliado por rubrica), não só listados
- Cota Max compartilhada por 2 usuários — cachear gerações, reservar o modelo bom p/ feedback
