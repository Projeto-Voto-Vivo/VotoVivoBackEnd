import express, { Router } from 'express';
import request from 'supertest';
import { VoteController } from './vote.controller';
import { NotFoundError } from '../services/parliamentarian.service';
import { errorHandler } from '../middlewares/error-handler';

describe('VoteController', () => {
  let app: express.Express;

  const serviceMock = {
    listVotesByVoting: jest.fn(),
    createVote: jest.fn(),
    deleteVote: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new VoteController(serviceMock as any);
    const router = Router();

    router.get('/votacoes/:votingId/votos', controller.listVotesByVoting);
    router.post('/votos', controller.createVote);
    router.delete('/votos/:id', controller.deleteVote);

    app = express();
    app.use(express.json());
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /votacoes/:votingId/votos', () => {
    it('should return 200 and list of votes', async () => {
      serviceMock.listVotesByVoting.mockResolvedValue([
        { id: 1, parlamentar: 'João da Silva', voto: 'YES' },
        { id: 2, parlamentar: 'Maria Santos', voto: 'NO' },
      ]);

      const response = await request(app).get('/votacoes/1/votos');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, parlamentar: 'João da Silva', voto: 'YES' },
        { id: 2, parlamentar: 'Maria Santos', voto: 'NO' },
      ]);
      expect(serviceMock.listVotesByVoting).toHaveBeenCalledWith(1);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listVotesByVoting.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/votacoes/1/votos');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('POST /votos', () => {
    it('should return 201 and created vote', async () => {
      const body = { parliamentarianId: 1, votingId: 2, choice: 'YES' };
      serviceMock.createVote.mockResolvedValue({ id: 10, ...body });

      const response = await request(app).post('/votos').send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: 10, ...body });
      expect(serviceMock.createVote).toHaveBeenCalledWith(body);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.createVote.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).post('/votos').send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('DELETE /votos/:id', () => {
    it('should return 200 and deleted vote', async () => {
      const deletedVote = {
        id: 1,
        parliamentarianId: 1,
        votingId: 2,
        choice: 'YES',
      };
      serviceMock.deleteVote.mockResolvedValue(deletedVote);

      const response = await request(app).delete('/votos/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(deletedVote);
      expect(serviceMock.deleteVote).toHaveBeenCalledWith(1);
    });

    it('should return 404 when vote is not found', async () => {
      serviceMock.deleteVote.mockRejectedValue(
        new NotFoundError('Voto não encontrado.'),
      );

      const response = await request(app).delete('/votos/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Voto não encontrado.' });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.deleteVote.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).delete('/votos/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
