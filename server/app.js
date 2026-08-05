import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import './db.js'; // initialize DB + schema on boot
import usersRoutes from './routes/users.js';
import decksRoutes from './routes/decks.js';
import reviewRoutes from './routes/review.js';
import writingRoutes from './routes/writing.js';
import listeningRoutes from './routes/listening.js';
import speakingRoutes from './routes/speaking.js';
import configRoutes from './routes/config.js';
import progressRoutes from './routes/progress.js';
import historyRoutes from './routes/history.js';
import recordingsRoutes from './routes/recordings.js';
import readingRoutes from './routes/reading.js';
import placementRoutes from './routes/placement.js';

// Build and configure the Fastify app (no .listen) so it can be reused in tests
// via app.inject().
export async function buildApp(opts = {}) {
  const app = Fastify({
    // Modest global body limit; the recording-upload route raises it per-route.
    bodyLimit: 2 * 1024 * 1024,
    logger: opts.logger ?? { level: 'info' },
  });

  // The browser only ever talks to the Vite dev origin (which proxies /api),
  // so we can safely restrict CORS to it (mitigates localhost DNS-rebinding).
  await app.register(cors, { origin: ['http://localhost:5173', 'https://localhost:5173'] });

  // OpenAPI docs at /docs (auto-generated from the registered routes).
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Mynah API',
        version: '0.1.0',
        description: 'API local do Mynah — vocabulário (SRS), listening, fala, escrita, progresso e IA plugável.',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Accept raw media uploads (self-recordings) as a Buffer.
  app.addContentTypeParser(
    ['video/webm', 'audio/webm', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (req, body, done) => done(null, body)
  );

  // Consistent error envelope; never leak internals on a 500.
  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.code(status).send({
      error: status === 500 ? 'internal_error' : err.code || 'error',
      message: status === 500 ? 'Erro interno no servidor.' : err.message,
    });
  });

  app.get('/api/health', () => ({ ok: true, service: 'mynah' }));

  await app.register(usersRoutes);
  await app.register(decksRoutes);
  await app.register(reviewRoutes);
  await app.register(writingRoutes);
  await app.register(listeningRoutes);
  await app.register(speakingRoutes);
  await app.register(configRoutes);
  await app.register(progressRoutes);
  await app.register(historyRoutes);
  await app.register(recordingsRoutes);
  await app.register(readingRoutes);
  await app.register(placementRoutes);

  return app;
}
