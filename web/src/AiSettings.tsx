import { useEffect, useState } from 'react';
import { api } from './api.js';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Field {
  k: string;
  label: string;
  ph: string;
  secret?: boolean;
}
interface Provider {
  key: string;
  cfgKey: string;
  name: string;
  badge: string;
  note: string;
  fields: Field[];
}

// key = provider id (backend), cfgKey = where its settings live in the config object.
const PROVIDERS: Provider[] = [
  {
    key: 'claude-cli',
    cfgKey: 'claude',
    name: 'Claude Code (Max)',
    badge: 'CLI · sem custo/token',
    note: 'Usa o CLI `claude` logado na assinatura Max. Sem custo por token.',
    fields: [
      { k: 'model', label: 'Modelo', ph: 'claude-haiku-4-5' },
      { k: 'command', label: 'Comando (avançado)', ph: 'claude' },
    ],
  },
  {
    key: 'codex-cli',
    cfgKey: 'codex',
    name: 'OpenAI Codex (CLI)',
    badge: 'CLI · sem custo/token',
    note: 'Usa o CLI `codex` logado no seu ChatGPT (Plus/Pro) — sem custo por token. Requer `codex` instalado (npm i -g @openai/codex) e `codex login`.',
    fields: [
      { k: 'model', label: 'Modelo (opcional)', ph: 'deixe em branco p/ o padrão' },
      { k: 'command', label: 'Comando (avançado)', ph: 'codex' },
    ],
  },
  {
    key: 'gemini-cli',
    cfgKey: 'geminiCli',
    name: 'Google Gemini (CLI)',
    badge: 'CLI · grátis',
    note: 'Usa o CLI `gemini` com sua conta Google — grátis (~1.000 req/dia). Requer `gemini` instalado (npm i -g @google/gemini-cli) e logado.',
    fields: [
      { k: 'model', label: 'Modelo (opcional)', ph: 'deixe em branco p/ o padrão' },
      { k: 'command', label: 'Comando (avançado)', ph: 'gemini' },
    ],
  },
  {
    key: 'ollama',
    cfgKey: 'ollama',
    name: 'Ollama (local)',
    badge: 'local · grátis',
    note: 'Modelos rodando na sua máquina, offline. Requer o Ollama instalado e rodando.',
    fields: [
      { k: 'baseUrl', label: 'Endereço', ph: 'http://localhost:11434' },
      { k: 'model', label: 'Modelo', ph: 'llama3.1' },
    ],
  },
  {
    key: 'openai',
    cfgKey: 'openai',
    name: 'OpenAI (API key)',
    badge: 'API · por token',
    note: 'Chave de API. Cobrado por token.',
    fields: [
      { k: 'apiKey', label: 'Chave da API', ph: 'sk-…', secret: true },
      { k: 'model', label: 'Modelo', ph: 'gpt-4o-mini' },
    ],
  },
  {
    key: 'gemini',
    cfgKey: 'gemini',
    name: 'Gemini (API key)',
    badge: 'API · tier grátis',
    note: 'Chave de API (Google AI Studio). Tem tier gratuito.',
    fields: [
      { k: 'apiKey', label: 'Chave da API', ph: 'AIza…', secret: true },
      { k: 'model', label: 'Modelo', ph: 'gemini-2.0-flash' },
    ],
  },
];

export default function AiSettings() {
  const [cfg, setCfg] = useState<any>(null);
  const [provider, setProvider] = useState('claude-cli');
  const [os, setOs] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getConfig().then((c) => {
      setCfg(c);
      setProvider(c.provider);
      setOs(c.detectedOs);
    });
  }, []);

  if (!cfg) return <section className="card"><p className="muted">Carregando IA…</p></section>;

  const active = PROVIDERS.find((p) => p.key === provider) || PROVIDERS[0];
  const ck = active.cfgKey;

  function setField(k: string, v: string) {
    setCfg((c: any) => ({ ...c, [ck]: { ...c[ck], [k]: v } }));
  }

  function payload() {
    return { provider, [ck]: cfg[ck] };
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const saved = await api.saveConfig(payload());
      setCfg((c: any) => ({ ...c, ...saved }));
      setMsg('✅ IA salva.');
    } catch (e) { setMsg('❌ ' + errMsg(e)); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg('Testando conexão… (pode levar alguns segundos)');
    try {
      const r = await api.testConfig(payload());
      setMsg(`✅ Conectado! Resposta: “${r.sample}”`);
    } catch (e) {
      setMsg('❌ Falhou: ' + (errMsg(e) || 'erro'));
    } finally { setBusy(false); }
  }

  return (
    <section className="card">
      <h2>🤖 Inteligência Artificial</h2>
      <p className="muted small">
        Escolha qual IA gera exercícios, correções e conversas. SO detectado:{' '}
        <strong>{os}</strong> (a chamada ao CLI se ajusta sozinha).
      </p>

      <label>Provedor</label>
      <div className="chips">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            className={`chip ${provider === p.key ? 'sel' : ''}`}
            onClick={() => { setProvider(p.key); setMsg(''); }}
          >
            {p.name}
          </button>
        ))}
        <button className="chip disabled" disabled title="Sem API pública de chat de uso geral">
          GitHub Copilot (indisponível)
        </button>
      </div>

      <p className="provider-note">
        <span className="badge">{active.badge}</span> {active.note}
      </p>

      {active.fields.map((f) => (
        <div key={f.k}>
          <label>{f.label}</label>
          <input
            type={f.secret ? 'password' : 'text'}
            placeholder={f.secret && cfg[ck].hasKey ? '•••••• (chave salva — deixe em branco p/ manter)' : f.ph}
            value={cfg[ck][f.k] ?? ''}
            onChange={(e) => setField(f.k, e.target.value)}
          />
        </div>
      ))}

      <div className="row end">
        {msg && <span className="small">{msg}</span>}
        <button className="ghost" onClick={test} disabled={busy}>Testar conexão</button>
        <button className="primary" onClick={save} disabled={busy}>Salvar IA</button>
      </div>
    </section>
  );
}
