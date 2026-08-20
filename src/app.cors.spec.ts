import request from 'supertest';

// O composition root dos routers instancia o PrismaClient no import.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'mysql://root:test@127.0.0.1:3306/votovivo';

/**
 * `app.ts` lê `CORS_ORIGINS` no momento do import, então cada cenário precisa
 * de um registro de módulos limpo.
 */
function carregarApp(corsOrigins?: string) {
  jest.resetModules();

  if (corsOrigins === undefined) {
    delete process.env.CORS_ORIGINS;
  } else {
    process.env.CORS_ORIGINS = corsOrigins;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./app').default;
}

describe('CORS', () => {
  const original = process.env.CORS_ORIGINS;

  afterAll(() => {
    if (original === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = original;
    }
  });

  /**
   * A API serve dados públicos e é somente-leitura. CORS não é controle de
   * acesso — ele só limita o que páginas web leem no navegador; curl, backends
   * e apps o ignoram. Restringir origem por padrão bloquearia reuso legítimo
   * sem proteger nada. O controle de abuso é o rate limit por IP.
   */
  it('should allow any origin by default', async () => {
    const app = carregarApp();

    const response = await request(app)
      .get('/')
      .set('Origin', 'https://qualquer-site-de-terceiro.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('should allow any origin when CORS_ORIGINS is empty', async () => {
    const app = carregarApp('');

    const response = await request(app)
      .get('/')
      .set('Origin', 'https://outro-site.example');

    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('should restrict to the configured list when CORS_ORIGINS is set', async () => {
    const app = carregarApp('https://votovivoleg.com.br,http://localhost:3000');

    const permitida = await request(app)
      .get('/')
      .set('Origin', 'https://votovivoleg.com.br');
    const bloqueada = await request(app)
      .get('/')
      .set('Origin', 'https://site-nao-listado.example');

    expect(permitida.headers['access-control-allow-origin']).toBe(
      'https://votovivoleg.com.br',
    );
    // Sem o cabeçalho, o navegador recusa a leitura da resposta.
    expect(bloqueada.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should advertise GET as the only allowed method', async () => {
    const app = carregarApp();

    const response = await request(app)
      .options('/parlamentares')
      .set('Origin', 'https://qualquer-site.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-methods']).toBe('GET');
  });
});
