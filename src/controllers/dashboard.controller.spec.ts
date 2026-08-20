import express, { Router } from 'express';
import request from 'supertest';
import { DashboardController } from './dashboard.controller';
import { errorHandler } from '../middlewares/error-handler';

describe('DashboardController', () => {
  let app: express.Express;

  const serviceMock = {
    getTotalEmendas: jest.fn(),
    getTopEmendas: jest.fn(),
    getTopDespesas: jest.fn(),
    compare: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock.getTotalEmendas.mockResolvedValue({ total: 0, metadata: {} });
    serviceMock.getTopEmendas.mockResolvedValue({ data: [], metadata: {} });
    serviceMock.getTopDespesas.mockResolvedValue({ data: [], metadata: {} });
    serviceMock.compare.mockResolvedValue({ data: [], metadata: {} });

    const controller = new DashboardController(serviceMock as any);
    const router = Router();

    router.get('/dashboards/emendas/total', controller.getTotalEmendas);
    router.get('/dashboards/emendas/top', controller.getTopEmendas);
    router.get('/dashboards/despesas/top', controller.getTopDespesas);
    router.get('/dashboards/comparacao', controller.compare);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /dashboards/emendas/total', () => {
    it('should default to the empenhado metric', async () => {
      const response = await request(app).get('/dashboards/emendas/total');

      expect(response.status).toBe(200);
      expect(serviceMock.getTotalEmendas).toHaveBeenCalledWith({
        ano: undefined,
        tipo: undefined,
        metrica: 'empenhado',
      });
    });

    it('should forward a valid metric', async () => {
      await request(app).get('/dashboards/emendas/total?metrica=pago&ano=2024');

      expect(serviceMock.getTotalEmendas).toHaveBeenCalledWith(
        expect.objectContaining({ metrica: 'pago', ano: 2024 }),
      );
    });

    /** `empenhado` != `liquidado` != `pago`: um valor fora do domínio nao pode
     * cair silenciosamente no default. */
    it('should return 400 for an unknown metric', async () => {
      const response = await request(app).get(
        '/dashboards/emendas/total?metrica=orcado',
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: metrica.' });
      expect(serviceMock.getTotalEmendas).not.toHaveBeenCalled();
    });

    it('should return 400 for an invalid year', async () => {
      const response = await request(app).get('/dashboards/emendas/total?ano=abc');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /dashboards/emendas/top', () => {
    it('should default limit to 10 and confiancaMinima to 0', async () => {
      await request(app).get('/dashboards/emendas/top?casa=camara');

      expect(serviceMock.getTopEmendas).toHaveBeenCalledWith(
        expect.objectContaining({ casa: 'camara', limit: 10, confiancaMinima: 0 }),
      );
    });

    it('should cap the limit', async () => {
      await request(app).get('/dashboards/emendas/top?casa=camara&limit=5000');

      expect(serviceMock.getTopEmendas).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('should return 400 when casa is missing', async () => {
      const response = await request(app).get('/dashboards/emendas/top');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/casa/);
      expect(serviceMock.getTopEmendas).not.toHaveBeenCalled();
    });

    it('should return 400 for a confiancaMinima outside 0-100', async () => {
      const response = await request(app).get(
        '/dashboards/emendas/top?casa=camara&confiancaMinima=150',
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /dashboards/despesas/top', () => {
    /** CEAP e CEAPS nao sao comparaveis: sem `casa` o ranking nao significa nada. */
    it('should return 400 when casa is missing, explaining why', async () => {
      const response = await request(app).get('/dashboards/despesas/top');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/não são comparáveis/);
    });

    it('should forward the normalization option', async () => {
      await request(app).get('/dashboards/despesas/top?casa=senado&normalizar=mes');

      expect(serviceMock.getTopDespesas).toHaveBeenCalledWith(
        expect.objectContaining({ casa: 'senado', normalizar: 'mes' }),
      );
    });
  });

  describe('GET /dashboards/comparacao', () => {
    it('should parse a comma separated id list', async () => {
      await request(app).get('/dashboards/comparacao?ids=1,2,3');

      expect(serviceMock.compare).toHaveBeenCalledWith(
        expect.objectContaining({ ids: [1, 2, 3], permitirCasasDistintas: false }),
      );
    });

    it('should read permitirCasasDistintas', async () => {
      await request(app).get(
        '/dashboards/comparacao?ids=1,2&permitirCasasDistintas=true',
      );

      expect(serviceMock.compare).toHaveBeenCalledWith(
        expect.objectContaining({ permitirCasasDistintas: true }),
      );
    });

    it('should return 400 when ids is missing', async () => {
      const response = await request(app).get('/dashboards/comparacao');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: ids.' });
    });

    it('should return 400 for a non-numeric id', async () => {
      const response = await request(app).get('/dashboards/comparacao?ids=1,abc');

      expect(response.status).toBe(400);
      expect(serviceMock.compare).not.toHaveBeenCalled();
    });
  });
});
