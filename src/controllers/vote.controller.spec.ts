import express, { Router } from 'express';
import request from 'supertest';
import { VoteController } from './vote.controller';
import { NotFoundError } from '../errors/http-errors';
import { errorHandler } from '../middlewares/error-handler';

describe('VoteController', () => {
  let app: express.Express;

  const serviceMock = {
    listVotesByVoting: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock.listVotesByVoting.mockResolvedValue({ data: [], meta: {} });

    const controller = new VoteController(serviceMock as any);
    const router = Router();

    router.get('/votacoes/:votingId/votos', controller.listVotesByVoting);

    app = express();
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /votacoes/:votingId/votos', () => {
    it('should return 200 and the paginated votes', async () => {
      const payload = {
        data: [{ id: 1, parlamentar: 'João da Silva', voto: 'SIM' }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };
      serviceMock.listVotesByVoting.mockResolvedValue(payload);

      const response = await request(app).get('/votacoes/1/votos');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(serviceMock.listVotesByVoting).toHaveBeenCalledWith(
        1,
        { page: 1, limit: 20 },
        { voto: undefined },
      );
    });

    it('should forward pagination', async () => {
      await request(app).get('/votacoes/1/votos?pagina=2&limite=50');

      expect(serviceMock.listVotesByVoting).toHaveBeenCalledWith(
        1,
        { page: 2, limit: 50 },
        expect.anything(),
      );
    });

    it('should accept a voto filter', async () => {
      await request(app).get('/votacoes/1/votos?voto=nao');

      expect(serviceMock.listVotesByVoting).toHaveBeenCalledWith(
        1,
        expect.anything(),
        { voto: 'NAO' },
      );
    });

    /** O banco grava com espaco; a API expoe com underscore. Aceitamos os dois. */
    it('should normalise the spaced enum spelling', async () => {
      await request(app).get('/votacoes/1/votos?voto=NAO%20REGISTRADO');

      expect(serviceMock.listVotesByVoting).toHaveBeenCalledWith(
        1,
        expect.anything(),
        { voto: 'NAO_REGISTRADO' },
      );
    });

    it('should return 400 for an unknown voto', async () => {
      const response = await request(app).get('/votacoes/1/votos?voto=TALVEZ');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: voto.' });
      expect(serviceMock.listVotesByVoting).not.toHaveBeenCalled();
    });

    it('should return 400 for a non-numeric votingId', async () => {
      const response = await request(app).get('/votacoes/abc/votos');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: votingId.' });
      expect(serviceMock.listVotesByVoting).not.toHaveBeenCalled();
    });

    it('should return 404 when the voting does not exist', async () => {
      serviceMock.listVotesByVoting.mockRejectedValue(
        new NotFoundError('Votação não encontrada.'),
      );

      const response = await request(app).get('/votacoes/999/votos');

      expect(response.status).toBe(404);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listVotesByVoting.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/votacoes/1/votos');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
