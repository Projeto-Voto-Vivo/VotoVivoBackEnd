import express, { Router } from 'express';
import request from 'supertest';
import { VotingController } from './voting.controller';
import { NotFoundError } from '../errors/http-errors';
import { errorHandler } from '../middlewares/error-handler';

describe('VotingController', () => {
  let app: express.Express;

  const serviceMock = {
    listVotings: jest.fn(),
    getVotingById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new VotingController(serviceMock as any);
    const router = Router();

    router.get('/votacoes', controller.listVotings);
    router.get('/votacoes/:id', controller.getVotingById);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /votacoes', () => {
    it('should return 200 and paginated votings', async () => {
      const payload = {
        data: [{ id: 1, resumo: 'Votação PL 123', resultado: 'Aprovado' }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };
      serviceMock.listVotings.mockResolvedValue(payload);

      const response = await request(app).get('/votacoes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(serviceMock.listVotings).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('should return 400 for an invalid limite', async () => {
      const response = await request(app).get('/votacoes?limite=0');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: limite.' });
      expect(serviceMock.listVotings).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listVotings.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/votacoes');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('GET /votacoes/:id', () => {
    it('should return 200 and voting details', async () => {
      serviceMock.getVotingById.mockResolvedValue({
        id: 1,
        resumo: 'Votação PL 123',
        resultado: 'Aprovado',
        votos: [],
      });

      const response = await request(app).get('/votacoes/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 1,
        resumo: 'Votação PL 123',
        resultado: 'Aprovado',
        votos: [],
      });
      expect(serviceMock.getVotingById).toHaveBeenCalledWith(1);
    });

    it('should return 404 when voting is not found', async () => {
      serviceMock.getVotingById.mockRejectedValue(
        new NotFoundError('Votação não encontrada.'),
      );

      const response = await request(app).get('/votacoes/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Votação não encontrada.' });
    });

    // Regressao: o controller lancava `Error('ID inválido')`, mensagem que o
    // errorHandler nao reconhecia, e a resposta virava 500 em vez de 400.
    it('should return 400 for a non-numeric id', async () => {
      const response = await request(app).get('/votacoes/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.getVotingById).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getVotingById.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/votacoes/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
