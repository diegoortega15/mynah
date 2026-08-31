// Uniform reply for AI-provider failures. Logs the full error server-side and
// returns a single machine code plus a friendly PT-BR message — never the raw
// e.message (CLI stderr, file paths, stack traces).

/**
 * The model declined because the request clashed with the profile's age or its
 * "never write about" list. That is the safety net WORKING — but it used to
 * surface as "the AI did not answer, check your provider", sending the learner
 * off to debug a setup that was fine. It deserves its own message.
 */
export class ContentBlockedError extends Error {
  constructor(reason = '') {
    super('content blocked by profile');
    this.name = 'ContentBlockedError';
    this.reason = reason;
  }
}

// A refusal comes back either as prose ("I can't create…") or as JSON carrying
// an error/reason instead of the content we asked for.
export function looksBlocked(parsed, raw = '') {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (parsed.error || parsed.reason || parsed.refusal) return true;
  }
  return /\b(cannot|can't|can not|unable to|won't) (create|write|generate|produce)\b/i.test(
    String(raw)
  );
}

export function aiFail(req, reply, e) {
  req.log.error(e);
  if (e instanceof ContentBlockedError) {
    return reply.code(422).send({
      error: 'content_blocked',
      detail:
        'Esse tema conflita com o perfil de conteúdo deste usuário (idade ou temas a evitar). ' +
        'Escolha outro tema, ou ajuste em Perfil → Sobre o conteúdo gerado.',
    });
  }
  return reply.code(502).send({
    error: 'ai_failed',
    detail:
      'A IA não respondeu. Confira em Perfil → 🤖 Inteligência Artificial se o provedor está configurado (e logado, no caso dos CLIs) e tente de novo.',
  });
}
