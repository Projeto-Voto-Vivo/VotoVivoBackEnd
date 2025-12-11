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
          situacao: 'Exercício',
          ...(filtros.nome && { nomeParlamentar: { contains: filtros.nome } }), 
          ...(filtros.partido && { 
            partido: { 
              siglaPartido: { equals: filtros.partido } 
            } 
          }),
          ...(filtros.uf && { uf: { equals: filtros.uf } }),
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
            take: 1,
            include: {
              partido: true 
            }
          }
        }
      })
    ]);

    const data = deputados.map(dep => {
      const status = dep.statusHistorico[0];
      return {
        id: dep.id, 
        nomeParlamentar: status?.nomeParlamentar || dep.nomeCivil,
        siglaPartido: status?.partido?.siglaPartido || 'S/P', 
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
      where: { id: id }, 
      include: {
        statusHistorico: {
          orderBy: { data: 'desc' },
          take: 1,
          include: { 
            gabinete: true, 
            partido: true   
          }
        },
        redesSociais: true
      }
    });

    if (!deputado) return null;

    const status = deputado.statusHistorico[0];

    return {
      id: deputado.id,
      nomeCivil: deputado.nomeCivil,
      dataNascimento: deputado.dataNascimento,
      email: status?.emailHistorico, 
      situacao: status?.situacao,
      nomeParlamentar: status?.nomeParlamentar,
      siglaPartido: status?.partido?.siglaPartido,
      uf: status?.uf,
      urlFoto: status?.urlFoto,
      gabinete: status?.gabinete || null,
      redesSociais: deputado.redesSociais.map((r: any) => ({
        url: r.linkRedeSocial
      }))
    };
  }
}
