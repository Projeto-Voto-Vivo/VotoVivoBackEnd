import request from 'supertest';
import app from '../../app';

jest.mock('../../services/DeputadoService');
jest.mock('../../services/DespesaService');

import { DeputadoService } from '../../services/DeputadoService';
import { DespesaService } from '../../services/DespesaService';

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
      expect(response.body).toEqual(mockRetorno);
    });
  });

  describe('GET /deputados/:id', () => {
    it('deve retornar 200 quando deputado existe', async () => {
      const mockDeputado = { id: 1, nomeParlamentar: 'Deputado 1' };
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
  });

  describe('GET /deputados/:id/gastos/resumo', () => {
    it('deve retornar o resumo de gastos', async () => {
      const mockResumo = [{ tipoDespesa: 'Hotel', total: 100 }];
      MockedDespesaService.prototype.resumoGastos.mockResolvedValue(mockResumo);

      const response = await request(app).get('/deputados/1/gastos/resumo');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResumo);
    });
  });
});
