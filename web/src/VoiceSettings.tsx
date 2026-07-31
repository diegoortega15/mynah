import { useEffect, useState } from 'react';
import { useSpeech } from './useSpeech.js';

const V_KEY = 'fluencylab.voiceURI';
const R_KEY = 'fluencylab.voiceRate';

export default function VoiceSettings() {
  const { enVoices, speak, stop } = useSpeech();
  const [voiceURI, setVoiceURI] = useState(localStorage.getItem(V_KEY) || '');
  const [rate, setRate] = useState(parseFloat(localStorage.getItem(R_KEY) ?? '') || 0.95);

  useEffect(() => {
    if (voiceURI) localStorage.setItem(V_KEY, voiceURI);
    else localStorage.removeItem(V_KEY);
  }, [voiceURI]);
  useEffect(() => {
    localStorage.setItem(R_KEY, String(rate));
  }, [rate]);

  const natural = enVoices.filter((v) => /natural|neural|online|google/i.test(v.name));

  return (
    <section className="card">
      <h2>🔊 Voz</h2>
      <p className="muted small">
        A voz vem do navegador. Para vozes bem naturais, use o <strong>Microsoft Edge</strong> e
        escolha uma com <strong>"Natural"</strong> no nome (ex: "Microsoft Aria Online (Natural)").
      </p>

      <label>Voz</label>
      <select value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
        <option value="">Automática (melhor disponível)</option>
        {natural.length > 0 && (
          <optgroup label="Naturais (recomendadas)">
            {natural.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))}
          </optgroup>
        )}
        <optgroup label="Todas as vozes em inglês">
          {enVoices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>
          ))}
        </optgroup>
      </select>

      <label>Velocidade: {rate.toFixed(2)}×</label>
      <input
        type="range"
        min="0.6"
        max="1.1"
        step="0.05"
        value={rate}
        onChange={(e) => setRate(parseFloat(e.target.value))}
      />

      <div className="row end">
        <button className="ghost" onClick={stop}>Parar</button>
        <button
          className="primary"
          onClick={() => speak("Hi! This is how I sound. Let's practice English together.")}
        >
          Testar voz
        </button>
      </div>

      {enVoices.length === 0 && (
        <p className="muted small">Nenhuma voz encontrada ainda — recarregue a página.</p>
      )}
    </section>
  );
}
