import express from 'express';
import request from 'supertest';
import { RankingController } from './ranking.controller';
import { ParliamentarianController } from './parliamentarian.controller';
import { errorHandler } from '../middlewares/error-handler';
import { InvalidParameterError } from '../errors/http-errors';

describe('RankingController', () => {
  let app: express.Express;

  const serviceMock = {
    rankParliamentarians: jest.fn(),
    listRankingOptions: jest.fn(),
  };

  const parliamentarianMock = {
    getParliamentarianById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock.rankParliamentarians.mockResolvedValue({ data: [], meta: {}, metadata: {} });

    const controller = new RankingController(serviceMock as any);
    const parliamentarian = new ParliamentarianController(parliamentarianMock as any);
    const router = express.Router();

    // A MESMA ordem de `routes/index.ts`: o ranking antes de `/parlamentares/:id`.
    router.get('/parlamentares/ranking/filtros', controller.listRankingOptions);
    router.get('/parlamentares/ranking', controller.rankParliamentarians);
    router.get('/parlamentares/:id', parliamentarian.getParliamentarianById);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  /**
   * `/parlamentares/:id` casaria com "ranking" e o trataria como um id. Se a
   * ordem de registro mudar, este teste cai antes da produção.
   */
  it('should not be shadowed by the parliamentarian detail route', async () => {
    await request(app).get('/parlamentares/ranking?tema=Saúde');

    expect(serviceMock.rankParliamentarians).toHaveBeenCalled();
    expect(parliamentarianMock.getParliamentarianById).not.toHaveBeenCalled();
  });

  it('should forward every criterion and filter', async () => {
    await request(app).get(
      '/parlamentares/ranking?tema=Saúde&funcaoEmenda=Saúde&destinoEmenda=SÃO PAULO - SP' +
        '&comissao=CSSF&partido=PT&casa=camara&uf=SP',
    );

    expect(serviceMock.rankParliamentarians).toHaveBeenCalledWith(
      {
        tema: 'Saúde',
        funcaoEmenda: 'Saúde',
        destinoEmenda: 'SÃO PAULO - SP',
        comissao: 'CSSF',
        partido: 'PT',
        casa: 'camara',
        uf: 'SP',
        pesos: undefined,
      },
      { page: 1, limit: 20 },
    );
  });

  describe('pesos', () => {
    it('should parse the compact weight syntax', async () => {
      await request(app).get('/parlamentares/ranking?tema=Saúde&pesos=tema:3,funcaoEmenda:0.5');

      expect(serviceMock.rankParliamentarians).toHaveBeenCalledWith(
        expect.objectContaining({ pesos: { tema: 3, funcaoEmenda: 0.5 } }),
        expect.anything(),
      );
    });

    /**
     * Peso descartado em silêncio devolveria um ranking calculado de outro
     * jeito, com a mesma cara do que foi pedido.
     */
    it('should return 400 for an unknown criterion', async () => {
      const response = await request(app).get('/parlamentares/ranking?tema=Saúde&pesos=xpto:2');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('xpto');
      expect(serviceMock.rankParliamentarians).not.toHaveBeenCalled();
    });

    /** Zero anularia o critério; negativo inverteria o ranking. */
    it.each(['tema:0', 'tema:-1', 'tema:abc', 'tema'])(
      'should return 400 for the weight "%s"',
      async (pesos) => {
        const response = await request(app).get(
          `/parlamentares/ranking?tema=Saúde&pesos=${encodeURIComponent(pesos)}`,
        );

        expect(response.status).toBe(400);
      },
    );
  });

  it('should surface the missing-criterion error as 400', async () => {
    serviceMock.rankParliamentarians.mockRejectedValue(
      new InvalidParameterError('criterio', 'Informe ao menos um critério de ranking.'),
    );

    const response = await request(app).get('/parlamentares/ranking?partido=PT');

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('ao menos um critério');
  });

  it('should return 400 for an invalid page', async () => {
    const response = await request(app).get('/parlamentares/ranking?tema=Saúde&pagina=abc');

    expect(response.status).toBe(400);
    expect(serviceMock.rankParliamentarians).not.toHaveBeenCalled();
  });

  it('should serve the filter options', async () => {
    serviceMock.listRankingOptions.mockResolvedValue({ temas: [{ valor: 'Saúde', total: 9 }] });

    const response = await request(app).get('/parlamentares/ranking/filtros');

    expect(response.status).toBe(200);
    expect(response.body.temas[0].valor).toBe('Saúde');
  });
});
