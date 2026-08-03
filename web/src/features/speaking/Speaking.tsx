import { useState } from 'react';
import { api } from '../../api.js';
import { useSpeech } from '../../useSpeech.js';
import { useToday, useRefreshDay } from '../../queries.js';
import Shadowing from './Shadowing.jsx';
import Tutor from './Tutor.jsx';
import RecordSelf from './RecordSelf.jsx';
import FourThreeTwo from './FourThreeTwo.jsx';
import Roleplay from './Roleplay.jsx';
import HelpTip from '../../HelpTip.jsx';
import type { User } from '../../types';

export default function Speaking({ user }: { user: User }) {
  const [mode, setMode] = useState('shadow'); // shadow | tutor | record
  const { sttSupported } = useSpeech();
  const { data: today } = useToday(user.id);
  const refreshDay = useRefreshDay(user.id);
  const speakBlock = today?.blocks?.speak; // today's speak-block progress

  // Called after each practice (shadowing score / tutor reply): counts toward the day.
  async function onPractice() {
    try {
      await api.markProgress(user.id, { block: 'speak' });
      refreshDay();
    } catch {}
  }

  return (
    <div className="speaking">
      <div className="row between">
        <h1>🗣️ Fala <HelpTip topic="speaking" /></h1>
        <div className="chips">
          <button className={`chip ${mode === 'shadow' ? 'sel' : ''}`} onClick={() => setMode('shadow')}>
            Shadowing
          </button>
          <button className={`chip ${mode === 'tutor' ? 'sel' : ''}`} onClick={() => setMode('tutor')}>
            Tutor (conversa)
          </button>
          <button className={`chip ${mode === 'roleplay' ? 'sel' : ''}`} onClick={() => setMode('roleplay')}>
            🎭 Roleplay
          </button>
          <button className={`chip ${mode === '432' ? 'sel' : ''}`} onClick={() => setMode('432')}>
            4·3·2
          </button>
          <button className={`chip ${mode === 'record' ? 'sel' : ''}`} onClick={() => setMode('record')}>
            Gravar-se
          </button>
        </div>
      </div>

      <div className={`speak-progress ${speakBlock?.done ? 'ok' : ''}`}>
        {speakBlock?.done
          ? '✅ Fala do dia concluída — pode continuar à vontade se quiser.'
          : `🗣️ Fala do dia: ${speakBlock?.info || '0/2 práticas'} — cada shadowing ou resposta do tutor conta 1.`}
      </div>

      {!sttSupported && (
        <p className="error small">
          Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge para o microfone.
        </p>
      )}

      {mode === 'shadow' && <Shadowing user={user} onPractice={onPractice} />}
      {mode === 'tutor' && <Tutor user={user} onPractice={onPractice} />}
      {mode === 'roleplay' && <Roleplay user={user} onPractice={onPractice} />}
      {mode === '432' && <FourThreeTwo user={user} onPractice={onPractice} />}
      {mode === 'record' && <RecordSelf user={user} onPractice={onPractice} />}
    </div>
  );
}
