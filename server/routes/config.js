import { getConfig, saveConfig, mergeConfig } from '../config.js';
import { chat } from '../services/ai.js';

const OS_LABEL = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

// Never return API keys to the client — expose only whether one is saved.
function redact(cfg) {
  const strip = (p) => {
    const { apiKey, ...rest } = p || {};
    return { ...rest, hasKey: !!apiKey };
  };
  return { ...cfg, openai: strip(cfg.openai), gemini: strip(cfg.gemini) };
}

export default async function configRoutes(app) {
  // Current AI config (secrets redacted) + detected OS.
  app.get('/api/config', () => {
    return {
      ...redact(getConfig()),
      detectedOs: OS_LABEL[process.platform] || process.platform,
      platform: process.platform,
    };
  });

  // Update AI config. An empty apiKey means "keep the existing one".
  app.put('/api/config', (req) => {
    const saved = saveConfig(req.body ?? {});
    return { ...redact(saved), detectedOs: OS_LABEL[process.platform] || process.platform };
  });

  // Quick connectivity test. Tries the candidate config in memory — nothing is
  // persisted here (a failed test must not leave a broken config saved; the
  // user saves explicitly with "Salvar IA").
  app.post('/api/config/test', async (req, reply) => {
    const candidate = mergeConfig(req.body ?? {});
    try {
      const out = await chat([{ role: 'user', content: 'Reply with exactly: OK' }], candidate);
      return { ok: true, sample: String(out).slice(0, 80) };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({
        ok: false,
        error:
          'Não consegui falar com esse provedor. Confira o comando/chave/modelo e se o CLI está logado.',
      });
    }
  });
}
