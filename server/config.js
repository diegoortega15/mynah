import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });
const configPath = join(dataDir, 'config.json');

// Which AI powers the app + per-provider settings. Stored locally (gitignored).
const DEFAULTS = {
  // claude-cli | codex-cli | gemini-cli | ollama | openai | gemini
  provider: 'claude-cli',
  // CLI providers (covered by subscription / free tier — no per-token cost)
  claude: { command: 'claude', model: 'claude-haiku-4-5' },
  codex: { command: 'codex', model: '' },
  geminiCli: { command: 'gemini', model: '' },
  ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.1' },
  // API providers (require a key, billed per token)
  openai: { apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  gemini: { apiKey: '', model: 'gemini-2.0-flash' },
};

export function getConfig() {
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {}
  return {
    provider: saved.provider || DEFAULTS.provider,
    claude: { ...DEFAULTS.claude, ...saved.claude },
    codex: { ...DEFAULTS.codex, ...saved.codex },
    geminiCli: { ...DEFAULTS.geminiCli, ...saved.geminiCli },
    ollama: { ...DEFAULTS.ollama, ...saved.ollama },
    openai: { ...DEFAULTS.openai, ...saved.openai },
    gemini: { ...DEFAULTS.gemini, ...saved.gemini },
  };
}

// Merge a provider config, but never clobber a saved apiKey with an empty one
// (the client sends an empty key to mean "keep the existing one").
function mergeKeyed(cur, patch) {
  const merged = { ...cur, ...(patch || {}) };
  if (!patch || !patch.apiKey) merged.apiKey = cur.apiKey;
  return merged;
}

export function saveConfig(patch = {}) {
  const cur = getConfig();
  const next = {
    provider: patch.provider || cur.provider,
    claude: { ...cur.claude, ...(patch.claude || {}) },
    codex: { ...cur.codex, ...(patch.codex || {}) },
    geminiCli: { ...cur.geminiCli, ...(patch.geminiCli || {}) },
    ollama: { ...cur.ollama, ...(patch.ollama || {}) },
    openai: mergeKeyed(cur.openai, patch.openai),
    gemini: mergeKeyed(cur.gemini, patch.gemini),
  };
  writeFileSync(configPath, JSON.stringify(next, null, 2));
  return next;
}
