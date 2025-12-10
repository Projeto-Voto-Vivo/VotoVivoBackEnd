import { mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

import { DespesaService } from '../../services/DespesaService';
import { prismaMock } from '../prismaMock';

const despesaService = new DespesaService();

describe('DespesaService', () => {
  describe('listarPorDeputado', () => {
    it('deve retornar lista paginada de despesas', async () => {
      const mockDespesas = [
        {
          despesaId: 1,
          deputadoId: 1,
          dataDocumento: new Date('2024-01-01'),
          tipoDespesa: 'Passagem',
          valorLiquido: 100.0,
          nomeFornecedor: 'Companhia Aérea',
          urlDocumento: 'http://nota.com'
        }
      ];

      prismaMock.despesa.count.mockResolvedValue(1);
      prismaMock.despesa.findMany.mockResolvedValue(mockDespesas as any);

      const resultado = await despesaService.listarPorDeputado(1, { pagina: 1, ano: 2024 });

      expect(prismaMock.despesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deputadoId: 1,
            ano: 2024
          })
        })
      );
      expect(resultado.data).toHaveLength(1);
      expect(resultado.data[0].valor).toBe(100.0);
    });
  });

  describe('resumoGastos', () => {
    it('deve agrupar gastos por tipo', async () => {
      const mockAgregacao = [
        { tipoDespesa: 'Hotel', _sum: { valorLiquido: 500 } },
        { tipoDespesa: 'Taxi', _sum: { valorLiquido: 100 } }
      ];

      // @ts-ignore
      prismaMock.despesa.groupBy.mockResolvedValue(mockAgregacao);

      const resultado = await despesaService.resumoGastos(1);

      expect(resultado).toHaveLength(2);
      expect(resultado[0]).toEqual({ tipoDespesa: 'Hotel', total: 500 });
    });
  });
});
