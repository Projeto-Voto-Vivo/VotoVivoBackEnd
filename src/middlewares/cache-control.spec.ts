import express from 'express';
import request from 'supertest';
import { cacheControl } from './cache-control';

describe('cacheControl', () => {
  const buildApp = (options?: Parameters<typeof cacheControl>[0]) => {
    const app = express();
    app.use(cacheControl(options));
    app.get('/recurso', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.post('/recurso', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  };

  /**
   * A Cloudflare nao guarda JSON sem instrucao explicita — sem este header,
   * toda requisicao atravessava ate o MySQL.
   */
  it('should send every directive the CDN needs', async () => {
    const response = await request(buildApp()).get('/recurso');

    const header = response.headers['cache-control'];
    expect(header).toContain('public');
    expect(header).toContain('max-age=300');
    expect(header).toContain('s-maxage=86400');
    expect(header).toContain('stale-while-revalidate=604800');
  });

  /**
   * O item mais importante da lista: se o banco cair, a borda continua servindo
   * a ultima resposta boa e a queda deixa de ser visivel para quem esta lendo.
   */
  it('should allow serving stale content when the origin fails', async () => {
    const response = await request(buildApp()).get('/recurso');

    expect(response.headers['cache-control']).toContain('stale-if-error=604800');
  });

  it('should accept explicit windows', async () => {
    const app = buildApp({ maxAge: 30, sMaxAge: 120 });

    const response = await request(app).get('/recurso');

    expect(response.headers['cache-control']).toContain('max-age=30');
    expect(response.headers['cache-control']).toContain('s-maxage=120');
  });

  it('should not mark non-GET responses as cacheable', async () => {
    const response = await request(buildApp()).post('/recurso');

    expect(response.headers['cache-control']).toBeUndefined();
  });

  it('should read the windows from the environment', async () => {
    const anterior = process.env.CACHE_S_MAXAGE;
    process.env.CACHE_S_MAXAGE = '10';

    try {
      const response = await request(buildApp()).get('/recurso');
      expect(response.headers['cache-control']).toContain('s-maxage=10');
    } finally {
      if (anterior === undefined) delete process.env.CACHE_S_MAXAGE;
      else process.env.CACHE_S_MAXAGE = anterior;
    }
  });
});
