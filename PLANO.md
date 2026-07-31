# FluencyLab — Plano de Desenvolvimento

App local para destravar inglês em 90 dias, baseado no plano pessoal de estudo
(input compreensível + output frequente, 1h/dia, foco carreira). Multiusuário
(você + esposa), roda 100% na sua máquina, integrado ao Claude via Claude Code
(coberto pela assinatura Max, sem custo por token).

---

## 1. Metodologia (espelha o plano de 90 dias)

Rotina diária de 1h em 4 blocos que se reforçam:

| Bloco        | Tempo  | Módulo no app                              |
|--------------|--------|--------------------------------------------|
| Ouvir        | 20 min | Listening (diálogos gerados + TTS)         |
| Vocabulário  | 15 min | Vocab SRS estilo Anki (SM-2)               |
| Fala         | 15 min | Speaking (shadowing + tutor por voz)       |
| Escrita      | 10 min | Writing (correção pela IA)                 |

Princípios que viram regras do software:

- **Card = frase inteira em contexto, com áudio — nunca palavra solta.**
- **Constância > intensidade** → app orientado a streak diário.
- **3 fases de 30 dias**: Dias 1–30 reativar/hábito · 31–60 fluência/trabalho ·
  61–90 polimento. A fase atual adapta prompts e metas.
- **Marcos**: Dia 7, 30, 45, 60, 90 (checkpoints de comportamento).
- **Foco do dia guiado, mas flexível**: sugere o foco (Seg=shadowing, Ter=tutor…)
  e deixa trocar livremente.

## 2. Arquitetura

```
Frontend  React + Vite   (localhost) — Web Speech API: TTS (ouvir) + STT (falar)
    | REST/JSON
Backend   Node + Fastify — SQLite (better-sqlite3)
                          — ClaudeService: spawn `claude -p --output-format json`
                            --model claude-haiku-4-5 --strict-mcp-config
```

- **Claude via Max**: o app aciona o Claude Code em modo headless. Usa Haiku +
  sem MCP para economizar cota. Sem chave de API, sem cobrança por token.
- **Áudio**: Web Speech API do navegador (Chrome/Edge), grátis e local.
- **Tudo local**: SQLite + áudios em `data/`. Nada sai da máquina.

## 3. Multiusuário

- Tela inicial = **seletor de perfil** (sem senha), estilo Netflix.
- Onboarding por perfil: nome, nível, data de início.
- Cada perfil tem **progresso, fase, streak, decks e cards próprios** (conteúdo
  separado por pessoa). Cota do Claude é compartilhada (um Max só).

## 4. Modelo de dados (SQLite)

```
users     (id, name, avatar, level, start_date, streak, longest_streak, last_active)
decks     (id, user_id, name, theme, created_at)
phrases   (id, deck_id, text_en, translation_pt, context, created_at)
cards     (id, phrase_id, ease, interval_days, reps, due_date, state)   -- SM-2
reviews   (id, card_id, rating, reviewed_at)
writings  (id, user_id, prompt, user_text, feedback_json, created_at)   -- Sprint 2
listening (id, user_id, title, dialogue_text, audio_path, level, ...)   -- Sprint 3
speaking  (id, user_id, mode, target_text, transcript, score, ...)      -- Sprint 4
sessions  (id, user_id, date, blocks_done_json, minutes_total)
```

## 5. Algoritmo SRS: SM-2 (o clássico do Anki)

Botões Again / Hard / Good / Easy. Ajusta ease factor (mín. 1.3), intervalos
(1d → 6d → interval×ease) e agenda `due_date`. "Again" volta o card pra hoje.

## 6. Roadmap

| Sprint | Entrega                                                        |
|--------|---------------------------------------------------------------|
| 0      | Scaffold Fastify+React+SQLite, ClaudeService, users/perfil    |
| 1 ⭐   | Vocab SRS (SM-2) + "Gerar pack" via Claude + TTS no card      |
| 2      | Writing + correção do Claude (JSON estruturado)               |
| 3      | Listening: diálogos gerados + TTS 2 vozes + salvar frase      |
| 4      | Speaking: shadowing (STT+score) + tutor por voz (`--resume`)  |
| 5      | Dashboard: foco do dia, streak, dia X/90, marcos              |
| Backlog| Podcasts reais (RSS BBC/TED), Whisper local, voz premium      |

## 7. Como rodar

```bash
# backend
cd server && npm install && npm start          # porta 3001
# frontend (outro terminal)
cd web && npm install && npm run dev            # porta 5173
```

Pré-requisito: estar logado no Claude Code (`claude`) com a conta Max.
