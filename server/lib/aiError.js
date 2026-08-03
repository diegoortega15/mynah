// Uniform reply for AI-provider failures. Logs the full error server-side and
// returns a single machine code ('ai_failed') plus a friendly PT-BR message —
// never the raw e.message (CLI stderr, file paths, stack traces).
export function aiFail(req, reply, e) {
  req.log.error(e);
  return reply.code(502).send({
    error: 'ai_failed',
    detail:
      'A IA não respondeu. Confira em Perfil → 🤖 Inteligência Artificial se o provedor está configurado (e logado, no caso dos CLIs) e tente de novo.',
  });
}
