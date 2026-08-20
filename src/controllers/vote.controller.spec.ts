import express, { Router } from 'express';
import request from 'supertest';
import { VoteController } from './vote.controller';
import { errorHandler } from '../middlewares/error-handler';

describe('VoteController', () => {
  let app: express.Express;

  const serviceMock = {
    listVotesByVoting: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new VoteController(serviceMock as any);
    const router = Router();

    router.get('/votacoes/:votingId/votos', controller.listVotesByVoting);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /votacoes/:votingId/votos', () => {
    it('should return 200 and list of votes', async () => {
      serviceMock.listVotesByVoting.mockResolvedValue([
        { id: 1, parlamentar: 'João da Silva', voto: 'SIM' },
        { id: 2, parlamentar: 'Maria Santos', voto: 'OBSTRUCAO' },
      ]);

      const response = await request(app).get('/votacoes/1/votos');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, parlamentar: 'João da Silva', voto: 'SIM' },
        { id: 2, parlamentar: 'Maria Santos', voto: 'OBSTRUCAO' },
      ]);
      expect(serviceMock.listVotesByVoting).toHaveBeenCalledWith(1);
    });

    it('should return 400 for a non-numeric votingId', async () => {
      const response = await request(app).get('/votacoes/abc/votos');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: votingId.' });
      expect(serviceMock.listVotesByVoting).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listVotesByVoting.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/votacoes/1/votos');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
