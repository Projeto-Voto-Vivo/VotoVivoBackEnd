import express, { Router } from 'express';
import request from 'supertest';
import { VotingController } from './voting.controller';
import { NotFoundError } from '../services/parliamentarian.service';
import { errorHandler } from '../middlewares/error-handler';

describe('VotingController', () => {
  let app: express.Express;

  const serviceMock = {
    listVotings: jest.fn(),
    getVotingById: jest.fn(),
    createVoting: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new VotingController(serviceMock as any);
    const router = Router();

    router.get('/votacoes', controller.listVotings);
    router.get('/votacoes/:id', controller.getVotingById);
    router.post('/votacoes', controller.createVoting);

    app = express();
    app.use(express.json());
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /votacoes', () => {
    it('should return 200 and list of votings', async () => {
      serviceMock.listVotings.mockResolvedValue([
        { id: 1, resumo: 'Votação PL 123', resultado: 'Aprovado' },
      ]);

      const response = await request(app).get('/votacoes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, resumo: 'Votação PL 123', resultado: 'Aprovado' },
      ]);
      expect(serviceMock.listVotings).toHaveBeenCalled();
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

    it('should return 500 on unexpected error', async () => {
      serviceMock.getVotingById.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/votacoes/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('POST /votacoes', () => {
    it('should return 201 and created voting', async () => {
      const body = { apiId: 200, subjectSummary: 'Nova votação' };
      serviceMock.createVoting.mockResolvedValue({ id: 5, ...body });

      const response = await request(app).post('/votacoes').send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: 5, ...body });
      expect(serviceMock.createVoting).toHaveBeenCalledWith(body);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.createVoting.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).post('/votacoes').send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
