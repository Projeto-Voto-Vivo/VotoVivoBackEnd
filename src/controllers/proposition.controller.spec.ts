import express, { Router } from 'express';
import request from 'supertest';
import { PropositionController } from './proposition.controller';
import { NotFoundError } from '../errors/http-errors';
import { errorHandler } from '../middlewares/error-handler';

describe('PropositionController', () => {
  let app: express.Express;

  const serviceMock = {
    listPropositions: jest.fn(),
    listFilterOptions: jest.fn(),
    listTramitacoes: jest.fn(),
    getPropositionById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new PropositionController(serviceMock as any);
    const router = Router();

    router.get('/proposicoes', controller.listPropositions);
    router.get('/proposicoes/filtros', controller.listFilterOptions);
    router.get('/proposicoes/:id/tramitacoes', controller.listTramitacoes);
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
      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        {
          tipo: undefined,
          ano: undefined,
          casa: undefined,
          situacao: undefined,
          tema: undefined,
          busca: undefined,
          autor: undefined,
        },
        { contarTotal: true },
      );
    });

    it('should forward pagina and limite to the service', async () => {
      serviceMock.listPropositions.mockResolvedValue({ data: [], meta: {} });

      await request(app).get('/proposicoes?pagina=3&limite=5');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 3, limit: 5 },
        expect.anything(),
        expect.anything(),
      );
    });

    it('should cap limite at the maximum page size', async () => {
      serviceMock.listPropositions.mockResolvedValue({ data: [], meta: {} });

      await request(app).get('/proposicoes?limite=100000');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 1, limit: 100 },
        expect.anything(),
        expect.anything(),
      );
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

  describe('GET /proposicoes com filtros', () => {
    beforeEach(() => {
      serviceMock.listPropositions.mockResolvedValue({ data: [], meta: {} });
    });

    /**
     * Sem filtros no servidor o cliente precisava paginar o universo inteiro
     * e recortar em memória — dezenas de requisições em série.
     */
    it('should forward tipo, ano, casa and situacao to the service', async () => {
      await request(app).get(
        '/proposicoes?tipo=PL&ano=2024&casa=camara&situacao=tramita%C3%A7%C3%A3o',
      );

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        expect.objectContaining({
          tipo: 'PL',
          ano: 2024,
          casa: 'camara',
          situacao: 'tramitação',
        }),
        expect.anything(),
      );
    });

    it('should treat blank filters as absent', async () => {
      await request(app).get('/proposicoes?tipo=&ano=&situacao=%20');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        {
          tipo: undefined,
          ano: undefined,
          casa: undefined,
          situacao: undefined,
          tema: undefined,
          busca: undefined,
          autor: undefined,
        },
        { contarTotal: true },
      );
    });

    it('should forward tema and busca to the service', async () => {
      await request(app).get(
        '/proposicoes?tema=Sa%C3%BAde&busca=transpar%C3%AAncia',
      );

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        expect.objectContaining({ tema: 'Saúde', busca: 'transparência' }),
        expect.anything(),
      );
    });

    it('should return 400 for a non-numeric ano', async () => {
      const response = await request(app).get('/proposicoes?ano=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: ano.' });
      expect(serviceMock.listPropositions).not.toHaveBeenCalled();
    });

    /**
     * `COUNT(*)` com os mesmos filtros e uma segunda varredura completa. Rolagem
     * infinita nao precisa de `lastPage`, so de saber se ha mais.
     */
    it('should let the client skip the total count', async () => {
      await request(app).get('/proposicoes?contarTotal=false');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { contarTotal: false },
      );
    });

    it('should keep counting for any other value', async () => {
      await request(app).get('/proposicoes?contarTotal=sim');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { contarTotal: true },
      );
    });
  });

  describe('GET /proposicoes/filtros', () => {
    it('should return the filter domains', async () => {
      const payload = { tipos: [], anos: [], situacoes: [], casas: [], metadata: {} };
      serviceMock.listFilterOptions.mockResolvedValue(payload);

      const response = await request(app).get('/proposicoes/filtros');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
    });

    /**
     * Registrada depois de `/proposicoes/:id`, esta rota seria capturada pelo
     * parâmetro e responderia 400.
     */
    it('should not be swallowed by the :id route', async () => {
      serviceMock.listFilterOptions.mockResolvedValue({});

      const response = await request(app).get('/proposicoes/filtros');

      expect(response.status).toBe(200);
      expect(serviceMock.getPropositionById).not.toHaveBeenCalled();
    });
  });

  describe('GET /proposicoes com filtro de autor', () => {
    beforeEach(() => {
      serviceMock.listPropositions.mockResolvedValue({ data: [], meta: {} });
    });

    /**
     * Sem cruzar autor com os demais filtros, o painel do perfil precisava
     * paginar tudo do parlamentar e recortar em memoria.
     */
    it('should forward autor combined with the other filters', async () => {
      await request(app).get('/proposicoes?autor=7&tipo=PL&ano=2024');

      expect(serviceMock.listPropositions).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        expect.objectContaining({ autor: 7, tipo: 'PL', ano: 2024 }),
        expect.anything(),
      );
    });

    it('should return 400 for a non-numeric autor', async () => {
      const response = await request(app).get('/proposicoes?autor=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: autor.' });
      expect(serviceMock.listPropositions).not.toHaveBeenCalled();
    });
  });

  describe('GET /proposicoes/:id/tramitacoes', () => {
    it('should return 200 with the paginated history', async () => {
      const payload = {
        data: [{ id: 1, sequencia: 1, descricaoTramitacao: 'Apresentação' }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };
      serviceMock.listTramitacoes.mockResolvedValue(payload);

      const response = await request(app).get('/proposicoes/1/tramitacoes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(serviceMock.listTramitacoes).toHaveBeenCalledWith(1, {
        page: 1,
        limit: 20,
      });
    });

    it('should return 400 for a non-numeric id', async () => {
      const response = await request(app).get('/proposicoes/abc/tramitacoes');

      expect(response.status).toBe(400);
      expect(serviceMock.listTramitacoes).not.toHaveBeenCalled();
    });

    it('should return 404 when the proposition does not exist', async () => {
      serviceMock.listTramitacoes.mockRejectedValue(
        new NotFoundError('Proposição não encontrada.'),
      );

      const response = await request(app).get('/proposicoes/999/tramitacoes');

      expect(response.status).toBe(404);
    });
  });
});
