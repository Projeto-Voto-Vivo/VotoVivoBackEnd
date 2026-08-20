import express from 'express';
import request from 'supertest';
import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  const buildApp = (options: Parameters<typeof rateLimit>[0]) => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(rateLimit(options));
    app.get('/recurso', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  };

  it('should allow requests up to the limit and expose RateLimit headers', async () => {
    const app = buildApp({ max: 3, janelaSegundos: 60 });

    const first = await request(app).get('/recurso');
    const second = await request(app).get('/recurso');
    const third = await request(app).get('/recurso');

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
    expect(first.headers['ratelimit-limit']).toBe('3');
    expect(first.headers['ratelimit-remaining']).toBe('2');
    expect(third.headers['ratelimit-remaining']).toBe('0');
  });

  it('should answer 429 with Retry-After once the limit is exceeded', async () => {
    const app = buildApp({ max: 2, janelaSegundos: 60 });

    await request(app).get('/recurso');
    await request(app).get('/recurso');
    const blocked = await request(app).get('/recurso');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      message: 'Limite de requisições excedido. Tente novamente em instantes.',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['ratelimit-remaining']).toBe('0');
  });

  /**
   * Caso de aceite explicito do plano: os contadores de dois IPs nao podem se
   * misturar. Sem `trust proxy` (ou com a chave errada) o limite viraria global
   * e um unico usuario bloquearia todos os outros.
   */
  it('should keep counters independent per IP', async () => {
    const app = buildApp({
      max: 1,
      janelaSegundos: 60,
      chave: (req) => req.ip ?? 'desconhecido',
    });

    const primeiroIpOk = await request(app)
      .get('/recurso')
      .set('X-Forwarded-For', '203.0.113.1');
    const primeiroIpBloqueado = await request(app)
      .get('/recurso')
      .set('X-Forwarded-For', '203.0.113.1');
    const segundoIp = await request(app)
      .get('/recurso')
      .set('X-Forwarded-For', '198.51.100.7');

    expect(primeiroIpOk.status).toBe(200);
    expect(primeiroIpBloqueado.status).toBe(429);
    // O IP B nao pode ser punido pelo excesso do IP A.
    expect(segundoIp.status).toBe(200);
  });

  it('should reset the window once it expires', async () => {
    let agora = 1_000_000;
    const app = buildApp({ max: 1, janelaSegundos: 60, agora: () => agora });

    expect((await request(app).get('/recurso')).status).toBe(200);
    expect((await request(app).get('/recurso')).status).toBe(429);

    agora += 61_000;

    expect((await request(app).get('/recurso')).status).toBe(200);
  });

  it('should be a passthrough when max is 0', async () => {
    const app = buildApp({ max: 0 });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/recurso')),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses[0].headers['ratelimit-limit']).toBeUndefined();
  });

  it('should read the configuration from the environment', async () => {
    const anterior = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_MAX = '1';

    try {
      const app = buildApp({});

      expect((await request(app).get('/recurso')).status).toBe(200);
      expect((await request(app).get('/recurso')).status).toBe(429);
    } finally {
      if (anterior === undefined) {
        delete process.env.RATE_LIMIT_MAX;
      } else {
        process.env.RATE_LIMIT_MAX = anterior;
      }
    }
  });
});
