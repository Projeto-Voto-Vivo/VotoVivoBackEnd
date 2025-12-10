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
});
