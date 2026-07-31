# Plano de melhoria — de "projeto pessoal" a "portfólio que impressiona"

Síntese de 3 revisões seniores (arquitetura backend, arquitetura frontend, UI/UX + apresentação).
Ordenado por **impacto ÷ esforço**. As fases 0–1 são as de maior retorno imediato.

---

## ⭐ Pontos fortes (destacar no README/entrevista)

- **`useSpeech.js`** — um hook que domestica 3 APIs instáveis do navegador (SpeechSynthesis, SpeechRecognition, MediaRecorder): TTS, STT, ditado contínuo com auto-restart, captura de vídeo, e pause/resume confiável contornando o bug do Chrome. É o destaque técnico do frontend.
- **Abstração de provedores de IA** (`services/ai.js` + `providers/*`) — padrão strategy: adicionar um provedor é 1 arquivo + 1 case. Destaque técnico do backend.
- **SQL 100% parametrizado** — zero injeção; o `UPDATE` dinâmico usa whitelist server-side.
- **Trata saída de LLM como não confiável** (`extractJson` + coerção de tipos).
- **SM-2, streak, heatmap** corretos; **Range HTTP** no streaming de vídeo.
- **Design system coeso** (tokens semânticos) + **microcopy PT-BR** acima da média.

---

## 🐛 Fase 0 — Correções críticas (bugs reais + segurança)

1. **Bug: áudio do card nunca toca.** `web/src/Vocab.jsx` (ReviewSession) faz `const { speak, supported } = useSpeech()`, mas o hook retorna `ttsSupported` — `supported` é sempre `undefined`. Corrigir para `ttsSupported`. *(Um TS/ESLint pegaria na hora.)*
2. **Bug de fuso: contagem diária erra à noite.** `server/routes/review.js` compara `date(reviewed_at)` (UTC) com `today()` (local). Após ~21h (BR), a revisão conta pro dia seguinte. Usar `date(reviewed_at,'localtime')` como já faz `history.js`.
3. **Segurança (postura local-first):**
   - `GET /api/config` devolve as **chaves de API** em texto → redir para `hasKey: true`.
   - `origin: true` no CORS → fixar `origin: ['http://localhost:5173']`.
   - `bodyLimit: 200MB` global → mover para a rota de upload apenas.
   - Validar `:id` como inteiro (Fastify param schema) → fecha IDOR/path de arquivo.
   - Documentar em alto e bom som: **app single-user, local-only por design** (sem auth).
4. **Error boundary no React** — hoje qualquer throw derruba a tela pra branco.

---

## 🏪 Fase 1 — Vitrine e credibilidade (baixo esforço, altíssimo sinal)

> O maior bloqueador hoje: **o projeto ainda não está no Git.** Recrutador abre o GitHub primeiro.

1. **`git init` + commits limpos (conventional commits) + push pro GitHub.**
2. **Screenshots (3–5) + 1 GIF** do fluxo (revisão / tutor) no topo do README.
3. **Corrigir README desatualizado:** a seção "Licença" ainda diz "adicione um LICENSE" (já existe MIT); trocar `<seu-usuario>` na URL.
4. **`package.json` na raiz** com `concurrently` → um único `npm run dev` (hoje são 2 terminais).
5. **Badges** (licença, Node, React/Fastify, CI).
6. **Diagrama de arquitetura** (React ↔ Fastify ↔ SQLite + provedores plugáveis).

---

## 🛡️ Fase 2 — Guardrails de qualidade

1. **ESLint + Prettier** (`react`, `react-hooks`, `jsx-a11y`) — pega bugs da classe do #0.1 e as falhas de a11y. (Hoje há um `eslint-disable` órfão, sem config.)
2. **Testes (Vitest / node:test)** — começar pelos puros e de alto sinal: `srs.js` (SM-2), `similarity()`, `extractJson()`, `streak.js`; depois rotas via `app.inject()`. Badge de cobertura.
3. **CI (GitHub Actions):** install + lint + test + `npm audit` no push. Badge verde = credibilidade barata.
4. **Acessibilidade** (checklist):
   - `:focus-visible` global (hoje há **zero** estilos de foco).
   - `@media (prefers-reduced-motion)` para pausar as animações `pulse`.
   - `label htmlFor`/`id` nos inputs (hoje usam só placeholder).
   - `aria-label` em botões só-ícone (🔊 🎤 🗑 ✕) e nas células do heatmap.
   - Flashcard `div onClick` → `button` (acessível por teclado).
   - `aria-live="polite"` nos status assíncronos (gerando, nota, erro).
   - Contraste: revisar branco sobre `--hard`/`--accent` (abaixo de 4.5:1).
   - `lang="en"` no conteúdo em inglês (cards, diálogos, tutor).

---

## 🏗️ Fase 3 — Modernização de arquitetura (o "efeito uau")

1. **TypeScript** (ou JSDoc + `checkJs`) — tipar `api.js`, `srs.js` e o contrato dos provedores. Maior sinal para vaga sênior; teria pego o bug #0.1 estaticamente.
2. **TanStack Query** — elimina os 4× `loadToday`/`getStats` duplicados, os `.catch(()=>{})` silenciosos e as race conditions (fetch sem AbortController).
3. **React Router** — URLs reais, back/forward, deep-link (hoje é `useState('dashboard')`).
4. **Fastify JSON Schema** nas rotas (params/body/response) + **@fastify/swagger** (`/docs`) — mata validação manual, fecha IDOR-param, e gera doc automática.
5. **Error handler global** + envelope de erro padronizado `{ error, code }` (parar de vazar `e.message` de ferramenta).
6. **Migration runner versionado** (`PRAGMA user_version`) no lugar dos `ALTER TABLE` em `try/catch`.
7. **`SpeechProvider` (Context)** — consolidar as ~7 instâncias de `useSpeech` numa máquina de estado única (o recurso `speechSynthesis` é global).

---

## ✨ Fase 4 — Polimento e deploy

1. **Split de arquivos grandes** em pastas por feature (`Speaking.jsx` tem 594 linhas / 5 componentes). Extrair `useRecorder()` (nível do `useSpeech`).
2. **Design-system:** extrair `Button`/`Card`/`Chip`/`Banner`; consolidar no `DayBanner` (hoje Vocab/Speaking replicam inline). Considerar CSS Modules/Tailwind.
3. **CONTRIBUTING.md**, **.env.example**, **CHANGELOG**.
4. **Storybook** (só depois dos primitivos).

> **Docker: descartado de propósito.** O provedor de IA padrão aciona o CLI `claude`
> logado na assinatura Max **do host** — um container não teria esse login/credenciais,
> quebrando a IA. O modelo do app é **local-first, single-user**, com acesso à rede via
> Vite (`host: true` + HTTPS). Documentar essa decisão no README vale mais que um
> Dockerfile que não roda o caso de uso principal.

---

## 🎯 Sequência recomendada (máximo impacto no currículo)

**Fase 0 (bugs/segurança) → Fase 1 (Git + screenshots + README) → ESLint/a11y + alguns testes + CI →** e então o headline: **TypeScript + TanStack Query + React Router + Fastify Schema/Swagger.** O resto é polimento.

**Pitch de 1 linha do repo:**
> *"PWA de imersão em inglês (plano de 90 dias) com um hook `useSpeech` que domestica as Web Speech + MediaRecorder APIs e uma camada de IA plugável (Claude/GPT/Gemini/Ollama) — em TypeScript + TanStack Query + React Router, com testes e CI."*
