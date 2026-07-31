import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = await buildApp();
app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => app.log.info(`Mynah API on http://127.0.0.1:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
