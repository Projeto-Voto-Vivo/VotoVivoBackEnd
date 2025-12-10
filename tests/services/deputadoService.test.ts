import { DeputadoService } from '../../src/services/DeputadoService';
import { prismaMock } from '../prismaMock';

const deputadoService = new DeputadoService();

describe('DeputadoService', () => {
  describe('listar', () => {
    it('deve retornar uma lista formatada de deputados', async () => {
      const mockDeputadosBanco = [
        {
          id: 1,
          deputadoId: 1234,
          nomeCivil: 'João da Silva',
          cpf: '111.111.111-11',
          sexo: 'M',
          dataNascimento: new Date(),
          ufNascimento: 'SP',
          municipioNascimento: 'São Paulo',
          escolaridade: 'Superior',
          uriDetalhes: null,
          urlWebsite: null,
          statusHistorico: [
            {
              id: 10,
              statusId: 99,
              deputadoId: 1,
              nomeParlamentar: 'João Político',
              siglaPartido: 'PARTIDO X',
              uf: 'SP',
              urlFoto: 'http://foto.com/joao.jpg',
              emailStatus: 'joao@camara.leg.br',
              situacao: 'Exercício',
              data: new Date(),
              urlPartido: null,
              descricaoStatus: null,
            },
          ],
        },
      ];

      prismaMock.deputado.count.mockResolvedValue(1);
      prismaMock.deputado.findMany.mockResolvedValue(mockDeputadosBanco as any);

      const resultado = await deputadoService.listar({ pagina: 1 });

      expect(prismaMock.deputado.findMany).toHaveBeenCalledTimes(1);
      expect(resultado.data).toHaveLength(1);
      expect(resultado.data[0]).toEqual({
        id: 1,
        nomeParlamentar: 'João Político', 
        siglaPartido: 'PARTIDO X',
        uf: 'SP',
        urlFoto: 'http://foto.com/joao.jpg',
      });
      expect(resultado.meta.total).toBe(1);
    });
  });

  describe('buscarPorId', () => {
    it('deve retornar null se o deputado não existir', async () => {
      prismaMock.deputado.findUnique.mockResolvedValue(null);

      const resultado = await deputadoService.buscarPorId(999);

      expect(resultado).toBeNull();
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
