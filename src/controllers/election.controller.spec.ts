import express from 'express';
import request from 'supertest';
import { ElectionController } from './election.controller';
import { errorHandler } from '../middlewares/error-handler';
import { NotFoundError } from '../errors/http-errors';

describe('ElectionController', () => {
  let app: express.Express;

  const serviceMock = {
    listResults: jest.fn(),
    getResultById: jest.fn(),
    listResultCandidates: jest.fn(),
    getSeats: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock.listResults.mockResolvedValue({ data: [], meta: {} });
    serviceMock.getResultById.mockResolvedValue({ idEleicaoResultado: 7 });
    serviceMock.listResultCandidates.mockResolvedValue({ data: [], meta: {} });
    serviceMock.getSeats.mockResolvedValue({ data: [] });

    const controller = new ElectionController(serviceMock as any);
    const router = express.Router();

    router.get('/eleicoes/bancadas', controller.getSeats);
    router.get('/eleicoes/resultados', controller.listResults);
    router.get('/eleicoes/resultados/:id', controller.getResultById);
    router.get('/eleicoes/resultados/:id/candidatos', controller.listResultCandidates);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /eleicoes/resultados', () => {
    it('should forward the filters and the pagination', async () => {
      const response = await request(app).get(
        '/eleicoes/resultados?ano=2026&turno=1&cargo=GOVERNADOR&uf=SP&pagina=2&limite=27',
      );

      expect(response.status).toBe(200);
      expect(serviceMock.listResults).toHaveBeenCalledWith(
        { ano: 2026, turno: 1, cargo: 'GOVERNADOR', uf: 'SP' },
        { page: 2, limit: 27 },
      );
    });

    it.each(['ano=abc', 'turno=3', 'turno=0', 'pagina=-1'])(
      'should answer 400 for %s',
      async (query) => {
        const response = await request(app).get(`/eleicoes/resultados?${query}`);

        expect(response.status).toBe(400);
        expect(serviceMock.listResults).not.toHaveBeenCalled();
      },
    );
  });

  describe('GET /eleicoes/resultados/:id', () => {
    it('should return the result', async () => {
      const response = await request(app).get('/eleicoes/resultados/7');

      expect(response.status).toBe(200);
      expect(serviceMock.getResultById).toHaveBeenCalledWith(7);
    });

    it('should answer 400 for a non-numeric id', async () => {
      const response = await request(app).get('/eleicoes/resultados/abc');

      expect(response.status).toBe(400);
    });

    it('should answer 404 when the service does not find it', async () => {
      serviceMock.getResultById.mockRejectedValue(
        new NotFoundError('Resultado de eleição não encontrado.'),
      );

      const response = await request(app).get('/eleicoes/resultados/99');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /eleicoes/resultados/:id/candidatos', () => {
    it('should forward the filters', async () => {
      await request(app).get(
        '/eleicoes/resultados/7/candidatos?nome=fulano&partido=ABC&eleito=true',
      );

      expect(serviceMock.listResultCandidates).toHaveBeenCalledWith(
        7,
        { nome: 'fulano', partido: 'ABC', eleito: true },
        { page: 1, limit: 20 },
      );
    });

    it('should leave eleito undefined when absent', async () => {
      await request(app).get('/eleicoes/resultados/7/candidatos');

      expect(serviceMock.listResultCandidates).toHaveBeenCalledWith(
        7,
        { nome: undefined, partido: undefined, eleito: undefined },
        { page: 1, limit: 20 },
      );
    });

    it('should answer 400 when eleito is not a boolean', async () => {
      const response = await request(app).get(
        '/eleicoes/resultados/7/candidatos?eleito=sim',
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /eleicoes/bancadas', () => {
    it('should forward cargo, ano and uf', async () => {
      await request(app).get('/eleicoes/bancadas?cargo=SENADOR&ano=2026&uf=SP');

      expect(serviceMock.getSeats).toHaveBeenCalledWith({
        cargo: 'SENADOR',
        ano: 2026,
        uf: 'SP',
      });
    });

    it('should answer 400 without cargo', async () => {
      const response = await request(app).get('/eleicoes/bancadas');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/cargo/);
      expect(serviceMock.getSeats).not.toHaveBeenCalled();
    });
  });
});
