import express, { Router } from 'express';
import request from 'supertest';
import { ParliamentarianController } from './parliamentarian.controller';
import { NotFoundError } from '../services/parliamentarian.service';
import { errorHandler } from '../middlewares/error-handler';

describe('ParliamentarianController', () => {
  let app: express.Express;

  const serviceMock = {
    listParliamentarians: jest.fn(),
    getParliamentarianById: jest.fn(),
    listExpensesByParliamentarianId: jest.fn(),
    getExpenseSummaryByParliamentarianId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new ParliamentarianController(serviceMock as any);
    const router = Router();

    router.get('/parlamentar', controller.listParliamentarians);
    router.get('/parlamentares/:id', controller.getParliamentarianById);
    router.get(
      '/parlamentares/:id/gastos',
      controller.listExpensesByParliamentarianId,
    );
    router.get(
      '/parlamentares/:id/gastos/resumo',
      controller.getExpenseSummaryByParliamentarianId,
    );

    app = express();
    app.use(express.json());
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /parlamentar', () => {
    it('should return 200 and a list of parliamentarians', async () => {
      serviceMock.listParliamentarians.mockResolvedValue([
        {
          id: 1,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          urlFoto: 'https://example.com/joao.jpg',
        },
      ]);

      const response = await request(app)
        .get('/parlamentar')
        .query({ nome: 'João', partido: 'PT', uf: 'SP' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          id: 1,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          urlFoto: 'https://example.com/joao.jpg',
        },
      ]);

      expect(serviceMock.listParliamentarians).toHaveBeenCalledWith({
        nome: 'João',
        partido: 'PT',
        uf: 'SP',
      });
    });

    it('should pass undefined for empty query params', async () => {
      serviceMock.listParliamentarians.mockResolvedValue([]);

      const response = await request(app)
        .get('/parlamentar')
        .query({ nome: '', partido: '', uf: '' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);

      expect(serviceMock.listParliamentarians).toHaveBeenCalledWith({
        nome: undefined,
        partido: undefined,
        uf: undefined,
      });
    });

    it('should return 500 when service throws unexpected error', async () => {
      serviceMock.listParliamentarians.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const response = await request(app).get('/parlamentar');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Erro interno do servidor.',
      });
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
        nomeCivil: 'João Carlos da Silva',
        dataNascimento: '1980-05-10',
        email: 'joao@camara.leg.br',
        gabinete: {
          telefone: '(61) 3215-1001',
          endereco: 'Anexo IV, Gabinete 101',
        },
        redesSociais: [
          {
            rede: 'Instagram',
            url: 'https://instagram.com/joao',
          },
        ],
      });

      const response = await request(app).get('/parlamentares/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 1,
        nomeParlamentar: 'João da Silva',
        siglaPartido: 'PT',
        uf: 'SP',
        urlFoto: 'https://example.com/joao.jpg',
        nomeCivil: 'João Carlos da Silva',
        dataNascimento: '1980-05-10',
        email: 'joao@camara.leg.br',
        gabinete: {
          telefone: '(61) 3215-1001',
          endereco: 'Anexo IV, Gabinete 101',
        },
        redesSociais: [
          {
            rede: 'Instagram',
            url: 'https://instagram.com/joao',
          },
        ],
      });

      expect(serviceMock.getParliamentarianById).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Parâmetro inválido: id.',
      });

      expect(serviceMock.getParliamentarianById).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getParliamentarianById.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Parlamentar não encontrado.',
      });
    });

    it('should return 500 on unexpected service error', async () => {
      serviceMock.getParliamentarianById.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const response = await request(app).get('/parlamentares/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Erro interno do servidor.',
      });
    });
  });

  describe('GET /parlamentares/:id/gastos', () => {
    it('should return 200 and a list of expenses', async () => {
      serviceMock.listExpensesByParliamentarianId.mockResolvedValue([
        {
          data: '2024-02-10',
          tipo: 'Hospedagem',
          fornecedor: 'Hotel Brasília',
          valor: 850,
          urlDocumento: 'https://example.com/invoice-1.pdf',
        },
      ]);

      const response = await request(app)
        .get('/parlamentares/1/gastos')
        .query({ ano: '2024', mes: '2', pagina: '3' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          data: '2024-02-10',
          tipo: 'Hospedagem',
          fornecedor: 'Hotel Brasília',
          valor: 850,
          urlDocumento: 'https://example.com/invoice-1.pdf',
        },
      ]);

      expect(serviceMock.listExpensesByParliamentarianId).toHaveBeenCalledWith(
        1,
        {
          ano: 2024,
          mes: 2,
          pagina: 3,
        },
      );
    });

    it('should pass undefined for empty query params', async () => {
      serviceMock.listExpensesByParliamentarianId.mockResolvedValue([]);

      const response = await request(app)
        .get('/parlamentares/1/gastos')
        .query({ ano: '', mes: '', pagina: '' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);

      expect(serviceMock.listExpensesByParliamentarianId).toHaveBeenCalledWith(
        1,
        {
          ano: undefined,
          mes: undefined,
          pagina: undefined,
        },
      );
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/parlamentares/abc/gastos');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Parâmetro inválido: id.',
      });

      expect(serviceMock.listExpensesByParliamentarianId).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.listExpensesByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get('/parlamentares/999/gastos');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Parlamentar não encontrado.',
      });
    });

    it('should return 500 on unexpected service error', async () => {
      serviceMock.listExpensesByParliamentarianId.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const response = await request(app).get('/parlamentares/1/gastos');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Erro interno do servidor.',
      });
    });
  });

  describe('GET /parlamentares/:id/gastos/resumo', () => {
    it('should return 200 and expense summary', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockResolvedValue([
        {
          tipoDespesa: 'Hospedagem',
          total: 850,
        },
      ]);

      const response = await request(app).get(
        '/parlamentares/1/gastos/resumo',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          tipoDespesa: 'Hospedagem',
          total: 850,
        },
      ]);

      expect(
        serviceMock.getExpenseSummaryByParliamentarianId,
      ).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get(
        '/parlamentares/abc/gastos/resumo',
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Parâmetro inválido: id.',
      });

      expect(
        serviceMock.getExpenseSummaryByParliamentarianId,
      ).not.toHaveBeenCalled();
    });

    it('should return 404 when parliamentarian is not found', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockRejectedValue(
        new NotFoundError('Parlamentar não encontrado.'),
      );

      const response = await request(app).get(
        '/parlamentares/999/gastos/resumo',
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Parlamentar não encontrado.',
      });
    });

    it('should return 500 on unexpected service error', async () => {
      serviceMock.getExpenseSummaryByParliamentarianId.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const response = await request(app).get(
        '/parlamentares/1/gastos/resumo',
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Erro interno do servidor.',
      });
    });
  });
});
