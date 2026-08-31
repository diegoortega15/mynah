import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from './api.js';
import { LEVELS } from './levels.js';
import Placement from './Placement.jsx';
import AiSettings from './AiSettings.jsx';
import VoiceSettings from './VoiceSettings.jsx';
import { useSpeech } from './useSpeech.js';
import type { User } from './types';

/**
 * First run, in the order that actually works.
 *
 * The profile used to be created and the placement test offered immediately —
 * but the test narrates English with the browser's voice, and everything AFTER
 * it needs an AI provider. A learner who finished the test and then hit "Gerar
 * diálogo" got nothing but an error. So the AI and the voice are settled first
 * and the test comes last, when it can actually work.
 *
 * Steps already satisfied show a ✅ and pass through in one click: the AI config
 * is global (data/config.json) and the voice is per browser, so the second
 * profile on the same machine does not set them up again.
 */
type Step = 'profile' | 'ai' | 'voice' | 'test';

const STEPS: { key: Step; label: string }[] = [
  { key: 'profile', label: 'Perfil' },
  { key: 'ai', label: 'IA' },
  { key: 'voice', label: 'Voz' },
  { key: 'test', label: 'Nível' },
];

export default function Onboarding({
  onCreated,
  onCancel,
}: {
  onCreated: (u: User) => void;
  onCancel: () => void;
}) {
  const { enVoices, ttsSupported, speak, stop } = useSpeech();
  const [step, setStep] = useState<Step>('profile');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<User | null>(null);
  const [aiOk, setAiOk] = useState<boolean | null>(null); // null = ainda checando

  const noEnglishVoice = !ttsSupported || enVoices.length === 0;

  // Health-check the AI as soon as the profile exists, so a machine that is
  // already set up sees a green tick instead of a form to fill in again.
  const checkAi = useCallback(async () => {
    setAiOk(null);
    try {
      await api.testConfig({});
      setAiOk(true);
    } catch {
      setAiOk(false);
    }
  }, []);
  useEffect(() => {
    if (created) checkAi();
  }, [created, checkAi]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      setCreated(await api.createUser({ name: name.trim(), level }));
      setStep('ai');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Finish, re-reading the profile in case the test changed the level.
  async function finish() {
    stop();
    if (!created) return;
    try {
      onCreated(await api.getUser(created.id));
    } catch {
      onCreated(created);
    }
  }

  const at = STEPS.findIndex((s) => s.key === step);
  const header = (
    <ol className="wizard-steps">
      {STEPS.map((s, i) => (
        <li key={s.key} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <span className="wz-num">{i < at ? '✓' : i + 1}</span> {s.label}
        </li>
      ))}
    </ol>
  );

  // --- 1. profile -----------------------------------------------------------
  if (step === 'profile') {
    return (
      <div className="center">
        <form className="card form onboard-wizard" onSubmit={submit}>
          <h1>Criar perfil</h1>
          {header}
          <p className="muted">
            Quatro passos: seus dados, a IA que gera o conteúdo, a voz que narra, e um teste
            opcional para descobrir seu nível.
          </p>

          <label htmlFor="ob-name">Nome</label>
          <input
            id="ob-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
          />

          <span className="field-label" id="ob-level">Nível de inglês (CEFR)</span>
          <div className="level-grid" role="group" aria-labelledby="ob-level">
            {LEVELS.map((l) => (
              <button
                type="button"
                key={l.code}
                className={`level-opt ${level === l.code ? 'sel' : ''}`}
                onClick={() => setLevel(l.code)}
              >
                <span className="lv-code">{l.code}</span>
                <span className="lv-name">{l.name}</span>
                <span className="lv-hint muted small">{l.hint}</span>
              </button>
            ))}
          </div>
          <p className="muted small">
            Chute por enquanto: no último passo há um teste de 8 minutos que mede isso de verdade,
            e dá para mudar quando quiser no Perfil.
          </p>

          {error && <p className="error">{error}</p>}

          <div className="row">
            <button type="button" className="ghost" onClick={onCancel}>
              Voltar
            </button>
            <button type="submit" className="primary" disabled={busy || !name.trim()}>
              {busy ? 'Criando…' : 'Continuar'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- 2. AI ----------------------------------------------------------------
  if (step === 'ai') {
    return (
      <div className="center">
        <section className="card onboard-wizard">
          <h1>Conectar a IA</h1>
          {header}
          {aiOk === null && (
            <p className="muted small">⏳ Verificando se já existe uma IA respondendo…</p>
          )}
          {aiOk === true && (
            <p className="level-note match">
              ✅ <strong>IA respondendo.</strong> Já está configurada nesta máquina — pode seguir.
            </p>
          )}
          {aiOk === false && (
            <p className="tx-local-note">
              ⚠️ Nenhuma IA respondeu. <strong>Sem ela quase nada funciona:</strong> diálogos,
              textos, correção da escrita e tutor dependem todos disso. Escolha um provedor abaixo
              e clique em <strong>Testar conexão</strong>.
            </p>
          )}
          <AiSettings />
          <div className="row gen">
            <button className="primary" onClick={() => setStep('voice')}>
              Continuar
            </button>
            <button className="ghost" onClick={checkAi} disabled={aiOk === null}>
              Verificar de novo
            </button>
            {aiOk === false && (
              <span className="muted small">Dá para configurar depois no Perfil.</span>
            )}
          </div>
        </section>
      </div>
    );
  }

  // --- 3. voice -------------------------------------------------------------
  if (step === 'voice') {
    return (
      <div className="center">
        <section className="card onboard-wizard">
          <h1>Escolher a voz</h1>
          {header}
          {noEnglishVoice ? (
            <p className="tx-local-note">
              ⚠️ Este navegador <strong>não tem nenhuma voz em inglês</strong>. Sem ela o app não
              narra os diálogos, e o teste de nível vai pular a parte de ouvir. Use o Chrome ou o
              Edge, que já vêm com vozes em inglês.
            </p>
          ) : (
            <p className="level-note match">
              ✅ <strong>{enVoices.length} voz(es) em inglês</strong> disponíveis. Já escolhi a mais
              natural — ouça antes de seguir e troque se preferir outra.
            </p>
          )}
          <VoiceSettings />
          <div className="row gen">
            <button
              className="ghost"
              disabled={noEnglishVoice}
              onClick={() => speak('This is the voice that will read English to you.')}
            >
              🔊 Ouvir um exemplo
            </button>
            <button
              className="primary"
              onClick={() => {
                stop();
                setStep('test');
              }}
            >
              Continuar
            </button>
          </div>
        </section>
      </div>
    );
  }

  // --- 4. placement test ----------------------------------------------------
  return (
    <div className="center">
      <div className="onboard-wizard">
        <div className="card wizard-only-steps">{header}</div>
        {created && <Placement userId={created.id} onApply={finish} onClose={finish} />}
      </div>
    </div>
  );
}
