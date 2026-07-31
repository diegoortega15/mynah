import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

describe('routes (via app.inject)', () => {
  it('GET /api/health returns ok', async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: 'mynah' });
    await app.close();
  });

  it('rejects a non-integer :id on recording upload (schema validation)', async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/abc/recordings?kind=video',
      headers: { 'content-type': 'video/webm' },
      payload: Buffer.from('x'),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
