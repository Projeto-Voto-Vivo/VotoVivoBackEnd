import express, { Router } from 'express';
import request from 'supertest';
import { ParliamentarianController } from './parliamentarian.controller';
import { NotFoundError } from '../errors/http-errors';
import { errorHandler } from '../middlewares/error-handler';

describe('ParliamentarianController', () => {
  let app: express.Express;

  const serviceMock = {
    listParliamentarians: jest.fn(),
    getParliamentarianById: jest.fn(),
    listExpensesByParliamentarianId: jest.fn(),
    getExpenseSummaryByParliamentarianId: jest.fn(),
    listAmendmentsByParliamentarianId: jest.fn(),
    getAmendmentSummaryByParliamentarianId: jest.fn(),
    listPropositionsByParliamentarianId: jest.fn(),
    listVotingsByParliamentarianId: jest.fn(),
    getPresenceByParliamentarianId: jest.fn(),
    getAggregatedProfile: jest.fn(),
    listCommitteesByParliamentarianId: jest.fn(),
    getThemeProfileByParliamentarianId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new ParliamentarianController(serviceMock as any);
    const router = Router();

    router.get('/parlamentares', controller.listParliamentarians);
    router.get('/parlamentares/:id/perfil', controller.getAggregatedProfile);
    router.get('/parlamentares/:id/emendas/resumo', controller.getAmendmentSummaryByParliamentarianId);
    router.get('/parlamentares/:id/emendas', controller.listAmendmentsByParliamentarianId);
    router.get('/parlamentares/:id/despesas/resumo', controller.getExpenseSummaryByParliamentarianId);
    router.get('/parlamentares/:id/despesas', controller.listExpensesByParliamentarianId);
    router.get('/parlamentares/:id/proposicoes', controller.listPropositionsByParliamentarianId);
    router.get('/parlamentares/:id/votacoes', controller.listVotingsByParliamentarianId);
    router.get('/parlamentares/:id/presenca', controller.getPresenceByParliamentarianId);
    router.get(
      '/parlamentares/:id/comissoes',
      controller.listCommitteesByParliamentarianId,
    );
    router.get(
      '/parlamentares/:id/temas',
      controller.getThemeProfileByParliamentarianId,
    );
    router.get('/parlamentares/:id', controller.getParliamentarianById);

    app = express();
    app.use(express.json());
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /parlamentares', () => {
    it('should return 200 with paginated data and meta', async () => {
      serviceMock.listParliamentarians.mockResolvedValue({
        data: [
          {
            id: 1,
            nomeParlamentar: 'João da Silva',
            siglaPartido: 'PT',
            uf: 'SP',
            urlFoto: 'https://example.com/joao.jpg',
            cargo: 'Deputado Federal',
          },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });

      const response = await request(app)
        .get('/parlamentares')
        .query({ nome: 'João', partido: 'PT', uf: 'SP', pagina: '1' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [
          {
            id: 1,
            nomeParlamentar: 'João da Silva',
            siglaPartido: 'PT',
            uf: 'SP',
            urlFoto: 'https://example.com/joao.jpg',
            cargo: 'Deputado Federal',
          },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });

      expect(serviceMock.listParliamentarians).toHaveBeenCalledWith({
        nome: 'João',
        partido: 'PT',
        uf: 'SP',
        pagina: 1,
      });
    });

    it('should pass undefined for empty query params', async () => {
      serviceMock.listParliamentarians.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, lastPage: 1, limit: 20 },
      });

      const response = await request(app)
        .get('/parlamentares')
        .query({ nome: '', partido: '', uf: '' });

      expect(response.status).toBe(200);
      expect(serviceMock.listParliamentarians).toHaveBeenCalledWith({
        nome: undefined,
        partido: undefined,
        uf: undefined,
        pagina: undefined,
      });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listParliamentarians.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('GET /parlamentares/:id', () => {
    it('should return 200 and parliamentarian details', async () => {
      serviceMock.getParliamentarianById.mockResolvedValue({
        id: 1,
        nomeParlamentar: 'João da Silva',
        siglaPartido: 'PT',
        uf: 'SP',
        urlFoto: 'https://example.com/joao.jpg',
        cargo: 'Deputado Federal',
        nomeCivil: 'João Carlos da Silva',
        dataNascimento: '1980-05-10',
        email: 'joao@camara.leg.br',
        gabinete: { telefone: '(61) 3215-1001', endereco: 'Anexo IV, Gabinete 101' },
        redesSociais: [{ rede: 'Instagram', url: 'https://instagram.com/joao' }],
      });

      const response = await request(app).get('/parlamentares/1');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(1);
      expect(response.body.cargo).toBe('Deputado Federal');
      expect(serviceMock.getParliamentarianById).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.getParliamentarianById).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getParliamentarianById.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Parlamentar não encontrado.' });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getParliamentarianById.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/despesas', () => {
    it('should return 200 with paginated expenses', async () => {
      serviceMock.listExpensesByParliamentarianId.mockResolvedValue({
        data: [{ data: '2024-02-10', tipo: 'Hospedagem', fornecedor: 'Hotel Brasília', valor: 850, urlDocumento: null }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });

      const response = await request(app)
        .get('/parlamentares/1/despesas')
        .query({ ano: '2024', mes: '2', pagina: '1' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, lastPage: 1, limit: 20 });
      expect(serviceMock.listExpensesByParliamentarianId).toHaveBeenCalledWith(1, {
        ano: 2024,
        mes: 2,
        pagina: 1,
      });
    });

    it('should pass undefined for empty query params', async () => {
      serviceMock.listExpensesByParliamentarianId.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, lastPage: 1, limit: 20 },
      });

      await request(app).get('/parlamentares/1/despesas').query({ ano: '', mes: '', pagina: '' });

      expect(serviceMock.listExpensesByParliamentarianId).toHaveBeenCalledWith(1, {
        ano: undefined,
        mes: undefined,
        pagina: undefined,
      });
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/despesas');

      expect(response.status).toBe(400);
      expect(serviceMock.listExpensesByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.listExpensesByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/despesas');

      expect(response.status).toBe(404);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listExpensesByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/despesas');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/despesas/resumo', () => {
    it('should return 200 with DespesasPerfil', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockResolvedValue({
        totalAno: 5000,
        mediaMensal: 416.67,
        maiorReembolso: 850,
        categorias: [{ tipoDespesa: 'Hospedagem', total: 850 }],
      });

      const response = await request(app)
        .get('/parlamentares/1/despesas/resumo')
        .query({ ano: '2025', mes: '12' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        totalAno: 5000,
        mediaMensal: 416.67,
        maiorReembolso: 850,
        categorias: [{ tipoDespesa: 'Hospedagem', total: 850 }],
      });
      expect(serviceMock.getExpenseSummaryByParliamentarianId).toHaveBeenCalledWith(1, {
        ano: 2025,
        mes: 12,
      });
    });

    it('should pass undefined for empty summary query params', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockResolvedValue({
        totalAno: 0,
        mediaMensal: 0,
        maiorReembolso: 0,
        categorias: [],
      });

      await request(app)
        .get('/parlamentares/1/despesas/resumo')
        .query({ ano: '', mes: '' });

      expect(serviceMock.getExpenseSummaryByParliamentarianId).toHaveBeenCalledWith(1, {
        ano: undefined,
        mes: undefined,
      });
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/despesas/resumo');

      expect(response.status).toBe(400);
      expect(serviceMock.getExpenseSummaryByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/despesas/resumo');

      expect(response.status).toBe(404);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/despesas/resumo');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/emendas', () => {
    it('should return 200 and list of amendments', async () => {
      const payload = {
        data: [{ id: 10, codigoEmenda: 'EMD-2024-001', ano: 2024 }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };
      serviceMock.listAmendmentsByParliamentarianId.mockResolvedValue(payload);

      const response = await request(app).get('/parlamentares/1/emendas');

      expect(response.status).toBe(200);
      // O swagger sempre prometeu {data, meta}; o service devolvia array puro.
      expect(response.body).toEqual(payload);
      expect(serviceMock.listAmendmentsByParliamentarianId).toHaveBeenCalledWith(1, {
        pagina: undefined,
        limite: undefined,
      });
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/emendas');

      expect(response.status).toBe(400);
      expect(serviceMock.listAmendmentsByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.listAmendmentsByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/emendas');

      expect(response.status).toBe(404);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listAmendmentsByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/emendas');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/emendas/resumo', () => {
    it('should return 200 and amendment summary', async () => {
      serviceMock.getAmendmentSummaryByParliamentarianId.mockResolvedValue({
        totalEmendas: 2,
        totalEmpenhado: 150000,
        totalLiquidado: 120000,
        totalPago: 120000,
      });

      const response = await request(app).get('/parlamentares/1/emendas/resumo');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        totalEmendas: 2,
        totalEmpenhado: 150000,
        totalLiquidado: 120000,
        totalPago: 120000,
      });
      expect(serviceMock.getAmendmentSummaryByParliamentarianId).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/emendas/resumo');

      expect(response.status).toBe(400);
      expect(serviceMock.getAmendmentSummaryByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getAmendmentSummaryByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/emendas/resumo');

      expect(response.status).toBe(404);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getAmendmentSummaryByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/emendas/resumo');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/proposicoes', () => {
    it('should return 200 with paginated propositions', async () => {
      serviceMock.listPropositionsByParliamentarianId.mockResolvedValue({
        data: [
          { id: 5, sigla: 'PL', numero: 123, ano: 2024, ementa: 'Dispõe sobre...', situacao: 'Em tramitação' },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });

      const response = await request(app)
        .get('/parlamentares/1/proposicoes')
        .query({ pagina: '1' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, lastPage: 1, limit: 20 });
      expect(serviceMock.listPropositionsByParliamentarianId).toHaveBeenCalledWith(1, { pagina: 1 });
    });

    it('should pass undefined pagina when not provided', async () => {
      serviceMock.listPropositionsByParliamentarianId.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, lastPage: 1, limit: 20 },
      });

      await request(app).get('/parlamentares/1/proposicoes');

      expect(serviceMock.listPropositionsByParliamentarianId).toHaveBeenCalledWith(1, {
        pagina: undefined,
      });
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/proposicoes');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.listPropositionsByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.listPropositionsByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/proposicoes');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Parlamentar não encontrado.' });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listPropositionsByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/proposicoes');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/votacoes', () => {
    it('should return 200 with paginated voting history', async () => {
      serviceMock.listVotingsByParliamentarianId.mockResolvedValue({
        data: [
          {
            id: 10,
            data: '2024-03-15',
            titulo: 'PL 123/2024',
            tema: 'Dispõe sobre transparência legislativa.',
            resumo: 'Votação PL 123',
            voto: 'YES',
            resultado: 'Aprovado',
            tipo: 'Nominal',
            proposicao: {
              id: 99,
              tipo: 'PL',
              numero: '123',
              ano: 2024,
              ementa: 'Dispõe sobre transparência legislativa.',
              situacao: 'Em tramitação',
            },
          },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });

      const response = await request(app)
        .get('/parlamentares/1/votacoes')
        .query({ pagina: '1' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].voto).toBe('YES');
      expect(response.body.meta).toEqual({ total: 1, page: 1, lastPage: 1, limit: 20 });
      expect(serviceMock.listVotingsByParliamentarianId).toHaveBeenCalledWith(1, { pagina: 1 });
    });

    it('should pass undefined pagina when not provided', async () => {
      serviceMock.listVotingsByParliamentarianId.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, lastPage: 1, limit: 20 },
      });

      await request(app).get('/parlamentares/1/votacoes');

      expect(serviceMock.listVotingsByParliamentarianId).toHaveBeenCalledWith(1, {
        pagina: undefined,
      });
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/votacoes');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.listVotingsByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.listVotingsByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/votacoes');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Parlamentar não encontrado.' });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listVotingsByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/votacoes');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/presenca', () => {
    it('should return 200 with presence metrics', async () => {
      serviceMock.getPresenceByParliamentarianId.mockResolvedValue({
        presenca: {
          sessoesDeliberativas: { taxa: 95.0, totalEventos: 20, faltas: 1 },
          naoSessoesDeliberativas: { taxa: 0, totalEventos: 0, faltas: 0 },
        },
      });

      const response = await request(app).get('/parlamentares/1/presenca');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        presenca: {
          sessoesDeliberativas: { taxa: 95.0, totalEventos: 20, faltas: 1 },
          naoSessoesDeliberativas: { taxa: 0, totalEventos: 0, faltas: 0 },
        },
      });
      expect(serviceMock.getPresenceByParliamentarianId).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/presenca');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.getPresenceByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getPresenceByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/presenca');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Parlamentar não encontrado.' });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getPresenceByParliamentarianId.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/presenca');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/perfil', () => {
    it('should return 200 with aggregated profile', async () => {
      serviceMock.getAggregatedProfile.mockResolvedValue({
        visaoGeral: { id: 1, nomeParlamentar: 'João da Silva', siglaPartido: 'PT', uf: 'SP' },
        votacoes: {
          presenca: { sessoesDeliberativas: { taxa: 90.0, totalEventos: 10, faltas: 1 }, naoSessoesDeliberativas: { taxa: 0, totalEventos: 0, faltas: 0 } },
          alinhamento: null,
          recentes: [],
        },
        proposicoes: { total: 5, aprovadas: 0, recentes: [] },
        despesas: { totalAno: 10000, mediaMensal: 833.33, maiorReembolso: 2000, categorias: [] },
        emendas: { totalEmendas: 3, totalEmpenhado: 150000, totalLiquidado: 120000, totalPago: 120000 },
      });

      const response = await request(app).get('/parlamentares/1/perfil');

      expect(response.status).toBe(200);
      expect(response.body.visaoGeral.id).toBe(1);
      expect(response.body.votacoes).toBeDefined();
      expect(response.body.proposicoes).toBeDefined();
      expect(response.body.despesas).toBeDefined();
      expect(response.body.emendas).toBeDefined();
      expect(serviceMock.getAggregatedProfile).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/perfil');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Parâmetro inválido: id.' });
      expect(serviceMock.getAggregatedProfile).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getAggregatedProfile.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/perfil');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Parlamentar não encontrado.' });
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getAggregatedProfile.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/parlamentares/1/perfil');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /parlamentares/:id/comissoes', () => {
    it('should return 200 with the committees from membroOrgao', async () => {
      const payload = {
        data: [{ id: 7, sigla: 'CCJC', cargo: 'Titular' }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };
      serviceMock.listCommitteesByParliamentarianId.mockResolvedValue(payload);

      const response = await request(app).get('/parlamentares/1/comissoes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(serviceMock.listCommitteesByParliamentarianId).toHaveBeenCalledWith(1, {
        pagina: undefined,
        limite: undefined,
      });
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/comissoes');

      expect(response.status).toBe(400);
      expect(serviceMock.listCommitteesByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.listCommitteesByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/comissoes');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /parlamentares com filtro de casa', () => {
    it('should forward casa and limite to the service', async () => {
      serviceMock.listParliamentarians.mockResolvedValue({ data: [], meta: {} });

      await request(app).get('/parlamentares?casa=senado&limite=50');

      expect(serviceMock.listParliamentarians).toHaveBeenCalledWith(
        expect.objectContaining({ casa: 'senado', limite: 50 }),
      );
    });
  });

  describe('GET /parlamentares/:id/temas', () => {
    it('should return 200 with the thematic profile', async () => {
      const payload = {
        proposicoes: { temas: [{ tema: 'Saúde', total: 7 }], totalProposicoes: 8, semTema: 0 },
        votacoes: { temas: [], totalVotos: 0, excluidos: {} },
        metadata: {},
      };
      serviceMock.getThemeProfileByParliamentarianId.mockResolvedValue(payload);

      const response = await request(app).get('/parlamentares/1/temas');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(serviceMock.getThemeProfileByParliamentarianId).toHaveBeenCalledWith(
        1,
        undefined,
      );
    });

    it('should forward limite when given', async () => {
      serviceMock.getThemeProfileByParliamentarianId.mockResolvedValue({});

      await request(app).get('/parlamentares/1/temas?limite=5');

      expect(serviceMock.getThemeProfileByParliamentarianId).toHaveBeenCalledWith(1, 5);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/temas');

      expect(response.status).toBe(400);
      expect(serviceMock.getThemeProfileByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 400 when limite is invalid', async () => {
      const response = await request(app).get('/parlamentares/1/temas?limite=0');

      expect(response.status).toBe(400);
      expect(serviceMock.getThemeProfileByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getThemeProfileByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/temas');

      expect(response.status).toBe(404);
    });
  });
});
