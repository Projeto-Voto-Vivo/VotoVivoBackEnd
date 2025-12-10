import { prisma } from '../lib/prisma';

interface FiltrosDespesa {
  ano?: number;
  mes?: number;
  pagina?: number;
}

export class DespesaService {
  async listarPorDeputado(deputadoId: number, filtros: FiltrosDespesa) {
    const itensPorPagina = 20;
    const pagina = filtros.pagina || 1;
    const skip = (pagina - 1) * itensPorPagina;

    const where = {
      deputadoId,
      ...(filtros.ano && { ano: filtros.ano }),
      ...(filtros.mes && { mes: filtros.mes }),
    };

    const [total, despesas] = await Promise.all([
      prisma.despesa.count({ where }),
      prisma.despesa.findMany({
        where,
        orderBy: { dataDocumento: 'desc' },
        take: itensPorPagina,
        skip,
        select: {
          dataDocumento: true,
          tipoDespesa: true,
          nomeFornecedor: true,
          valorLiquido: true,
          urlDocumento: true
        }
      })
    ]);

    return {
      data: despesas.map(d => ({
        data: d.dataDocumento,
        tipo: d.tipoDespesa,
        fornecedor: d.nomeFornecedor,
        valor: d.valorLiquido,
        urlDocumento: d.urlDocumento
      })),
      meta: {
        total,
        pagina,
        itensPorPagina
      }
    };
  }

  async resumoGastos(deputadoId: number) {
    const agrupado = await prisma.despesa.groupBy({
      by: ['tipoDespesa'],
      where: { deputadoId },
      _sum: {
        valorLiquido: true
      },
      orderBy: {
        _sum: {
          valorLiquido: 'desc'
        }
      }
    });

    return agrupado.map(item => ({
      tipoDespesa: item.tipoDespesa,
      total: item._sum.valorLiquido || 0
    }));
  }
}
