import request from 'supertest';
import app from '../../src/app';

jest.mock('../../src/services/DeputadoService');
jest.mock('../../src/services/DespesaService');

import { DeputadoService } from '../../src/services/DeputadoService';
import { DespesaService } from '../../src/services/DespesaService';

const MockedDeputadoService = DeputadoService as jest.MockedClass<typeof DeputadoService>;
const MockedDespesaService = DespesaService as jest.MockedClass<typeof DespesaService>;

describe('Deputado Controller e Rotas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /deputados', () => {
    it('deve retornar status 200 e lista de deputados', async () => {
      const mockRetorno = {
        data: [{ id: 1, nomeParlamentar: 'Teste', siglaPartido: 'PV', uf: 'SP', urlFoto: '' }],
        meta: { total: 1, pagina: 1, itensPorPagina: 10, totalPaginas: 1 },
      };
      
      MockedDeputadoService.prototype.listar.mockResolvedValue(mockRetorno);

      const response = await request(app).get('/deputados');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRetorno.data); 
      expect(MockedDeputadoService.prototype.listar).toHaveBeenCalled();
    });

    it('deve filtrar por query params', async () => {
      MockedDeputadoService.prototype.listar.mockResolvedValue({ data: [], meta: {} } as any);

      await request(app).get('/deputados?nome=Silva&uf=RJ');

      expect(MockedDeputadoService.prototype.listar).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Silva',
          uf: 'RJ'
        })
      );
    });
  });

  describe('GET /deputados/:id', () => {
    it('deve retornar 200 quando deputado existe', async () => {
      const mockDeputado = { id: 1, nomeParlamentar: 'Deputado 1', redesSociais: [] };
      MockedDeputadoService.prototype.buscarPorId.mockResolvedValue(mockDeputado as any);

      const response = await request(app).get('/deputados/1');

      expect(response.status).toBe(200);
      expect(response.body.nomeParlamentar).toBe('Deputado 1');
    });

    it('deve retornar 404 quando deputado não existe', async () => {
      MockedDeputadoService.prototype.buscarPorId.mockResolvedValue(null);

      const response = await request(app).get('/deputados/999');

      expect(response.status).toBe(404);
    });

    it('deve retornar 400 se ID inválido', async () => {
      const response = await request(app).get('/deputados/abc');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /deputados/:id/gastos', () => {
    it('deve retornar lista de gastos', async () => {
      MockedDespesaService.prototype.listarPorDeputado.mockResolvedValue({
        data: [],
        meta: {}
      } as any);

      const response = await request(app).get('/deputados/1/gastos');

      expect(response.status).toBe(200);
      expect(MockedDespesaService.prototype.listarPorDeputado).toHaveBeenCalledWith(1, expect.anything());
    });
  });

	describe('GET /deputados/:id/gastos/resumo', () => {
    it('deve retornar o resumo de gastos agrupado', async () => {
      const mockResumo = [
        { tipoDespesa: 'Passagem Aérea', total: 5000.00 },
        { tipoDespesa: 'Telefonia', total: 200.00 }
      ];

      // Mock da implementação do serviço
      MockedDespesaService.prototype.resumoGastos.mockResolvedValue(mockResumo);

      const response = await request(app).get('/deputados/1/gastos/resumo');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('total', 5000.00);
      expect(MockedDespesaService.prototype.resumoGastos).toHaveBeenCalledWith(1);
    });

    it('deve retornar 400 se ID inválido', async () => {
      const response = await request(app).get('/deputados/abc/gastos/resumo');
      expect(response.status).toBe(400);
    });
  });
});
