import { prisma } from '../lib/prisma';

interface FiltrosDeputado {
  nome?: string;
  partido?: string;
  uf?: string;
  pagina?: number;
}

export class DeputadoService {
  async listar(filtros: FiltrosDeputado) {
    const itensPorPagina = 10;
    const pagina = filtros.pagina || 1;
    const skip = (pagina - 1) * itensPorPagina;

    const where = {
      statusHistorico: {
        some: {
          situacao: 'Em Exercício', // Apenas ativos conforme Swagger
          ...(filtros.nome && { nomeParlamentar: { contains: filtros.nome, mode: 'insensitive' as const } }),
          ...(filtros.partido && { siglaPartido: { equals: filtros.partido, mode: 'insensitive' as const } }),
          ...(filtros.uf && { uf: { equals: filtros.uf, mode: 'insensitive' as const } }),
        }
      }
    };

    const [total, deputados] = await Promise.all([
      prisma.deputado.count({ where }),
      prisma.deputado.findMany({
        where,
        take: itensPorPagina,
        skip,
        include: {
          statusHistorico: {
            orderBy: { data: 'desc' },
            take: 1
          }
        }
      })
    ]);

    // Formatação para simplificar o retorno (Flattening)
    const data = deputados.map(dep => {
      const status = dep.statusHistorico[0];
      return {
        id: dep.deputadoId,
        nomeParlamentar: status?.nomeParlamentar || dep.nomeCivil,
        siglaPartido: status?.siglaPartido,
        uf: status?.uf,
        urlFoto: status?.urlFoto
      };
    });

    return {
      data,
      meta: {
        total,
        pagina,
        itensPorPagina,
        totalPaginas: Math.ceil(total / itensPorPagina)
      }
    };
  }

  async buscarPorId(id: number) {
    const deputado = await prisma.deputado.findUnique({
      where: { deputadoId: id },
      include: {
        statusHistorico: {
          orderBy: { data: 'desc' },
          take: 1,
          include: {
            gabinetes: true
          }
        },
        redesSociais: true
      }
    });

    if (!deputado) return null;

    const status = deputado.statusHistorico[0];

    return {
      id: deputado.deputadoId,
      nomeCivil: deputado.nomeCivil,
      dataNascimento: deputado.dataNascimento,
      email: status?.emailStatus,
      situacao: status?.situacao,
      nomeParlamentar: status?.nomeParlamentar,
      siglaPartido: status?.siglaPartido,
      uf: status?.uf,
      urlFoto: status?.urlFoto,
      gabinete: status?.gabinetes[0] || null,
      redesSociais: deputado.redesSociais.map(r => ({
        // No schema real, redeId provavelmente mapearia para um nome, 
        // aqui simplificamos retornando o link direto
        url: r.linkRedeSocial 
      }))
    };
  }
}
