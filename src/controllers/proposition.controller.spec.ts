import express, { Router } from 'express';
import request from 'supertest';
import { PropositionController } from './proposition.controller';
import { NotFoundError } from '../errors/http-errors';
import { errorHandler } from '../middlewares/error-handler';

describe('PropositionController', () => {
  let app: express.Express;

  const serviceMock = {
    listPropositions: jest.fn(),
    getPropositionById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new PropositionController(serviceMock as any);
    const router = Router();

    router.get('/proposicoes', controller.listPropositions);
    router.get('/proposicoes/:id', controller.getPropositionById);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /proposicoes', () => {
    it('should return 200 and paginated propositions', async () => {
      const payload = {
        data: [{ id: 1, sigla: 'PL', numero: '123', ano: 2024 }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };
      serviceMock.listPropositions.mockResolvedValue(payload);

      const response = await request(app).get('/proposicoes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(serviceMock.listPropositions).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
    });

    it('should forward pagina and limite to the service', async () => {
      serviceMock.listPropositions.mockResolvedValue({ data: [], meta: {} });

      await request(app).get('/proposicoes?pagina=3&limite=5');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith({
        page: 3,
        limit: 5,
      });
    });

    it('should cap limite at the maximum page size', async () => {
      serviceMock.listPropositions.mockResolvedValue({ data: [], meta: {} });

      await request(app).get('/proposicoes?limite=100000');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith({
        page: 1,
        limit: 100,
      });
    });

    it('should return 400 for an invalid pagina', async () => {
      const response = await request(app).get('/proposicoes?pagina=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: pagina.' });
      expect(serviceMock.listPropositions).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listPropositions.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/proposicoes');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('GET /proposicoes/:id', () => {
    it('should return 200 and proposition with votings', async () => {
      const proposition = {
        id: 1,
        sigla: 'PL',
        votacoes: [{ id: 1, resultado: 'Aprovado' }],
      };
      serviceMock.getPropositionById.mockResolvedValue(proposition);

      const response = await request(app).get('/proposicoes/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(proposition);
      expect(serviceMock.getPropositionById).toHaveBeenCalledWith(1);
    });

    it('should return 404 when proposition does not exist', async () => {
      serviceMock.getPropositionById.mockRejectedValue(
        new NotFoundError('Proposição não encontrada.'),
      );

      const response = await request(app).get('/proposicoes/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Proposição não encontrada.' });
    });

    it('should return 400 for a non-numeric id', async () => {
      const response = await request(app).get('/proposicoes/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.getPropositionById).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getPropositionById.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/proposicoes/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
