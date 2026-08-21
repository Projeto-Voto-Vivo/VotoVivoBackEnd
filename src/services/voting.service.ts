import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { classificarObjeto, ehMerito } from '../domain/objeto-votacao';
import { montarPlacar, totalDoPlacar } from '../domain/placar';
import { buildMeta, Pagination, TAMANHO_PAGINA_PADRAO } from '../lib/request-params';

export class VotingService {
  constructor(private readonly prisma: PrismaClient) {}

  async listVotings(pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO }) {
    const { page, limit } = pagination;

    const [votings, total] = await Promise.all([
      this.prisma.voting.findMany({
        include: {
          proposition: { include: { propositionType: true } },
          orgao: true,
        },
        orderBy: {
          votingDate: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.voting.count(),
    ]);

    return {
      data: votings.map((v) => ({
        id: v.id,
        apiId: v.apiId,
        casa: v.casa,
        data: v.votingDate,
        resumo: v.subjectSummary,
        resultado: v.finalResult,
        tipo: v.votingType,
        // Sobre O QUE se votou. Sem isto, SIM e NAO nao tem significado estavel.
        objeto: classificarObjeto(v.subjectSummary),
        merito: ehMerito(classificarObjeto(v.subjectSummary)),
        orgao: v.orgao
          ? {
              id: v.orgao.idOrgao,
              sigla: v.orgao.sigla,
              nome: v.orgao.nome,
              tipoOrgao: v.orgao.tipoOrgao,
              casa: v.orgao.casa,
            }
          : null,
        proposicao: v.proposition
          ? {
              id: v.proposition.id,
              tipo: v.proposition?.propositionType?.sigla ?? null,
              numero: v.proposition.number,
              ano: v.proposition.year,
            }
          : null,
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Detalhe da votação com o placar agregado.
   *
   * O payload NÃO traz a lista nominal de votos: eram até 513 objetos por
   * votação, o que obrigava o cliente a limitar quantas votações detalhava. O
   * `placar` é contado no banco (`groupBy`) e cobre o caso de uso comum; quem
   * precisa do voto de cada parlamentar usa `GET /votacoes/:id/votos`, que é
   * paginado.
   */
  async getVotingById(id: number) {
    const voting = await this.prisma.voting.findUnique({
      where: { id },
      include: {
        proposition: { include: { propositionType: true } },
        orgao: true,
        orientations: true,
      },
    });

    if (!voting) {
      throw new NotFoundError('Votação não encontrada.');
    }

    const contagem = await this.prisma.vote.groupBy({
      by: ['choice'],
      where: { votingId: id },
      _count: { _all: true },
    });

    const placar = montarPlacar(contagem);

    return {
      id: voting.id,
      apiId: voting.apiId,
      casa: voting.casa,
      data: voting.votingDate,
      resumo: voting.subjectSummary,
      resultado: voting.finalResult,
      tipo: voting.votingType,
      objeto: classificarObjeto(voting.subjectSummary),
      merito: ehMerito(classificarObjeto(voting.subjectSummary)),
      // Votação em comissão e votação em plenário não se leem do mesmo jeito.
      orgao: voting.orgao
        ? {
            id: voting.orgao.idOrgao,
            sigla: voting.orgao.sigla,
            nome: voting.orgao.nome,
            tipoOrgao: voting.orgao.tipoOrgao,
            casa: voting.orgao.casa,
          }
        : null,
      proposicao: voting.proposition
        ? {
            id: voting.proposition.id,
            tipo: voting.proposition.propositionType?.sigla ?? null,
            numero: voting.proposition.number,
            ano: voting.proposition.year,
            ementa: voting.proposition.summary,
          }
        : null,
      orientacoes: voting.orientations.map((o) => ({
        bancada: o.bench,
        orientacao: o.orientation,
      })),
      placar,
      totalVotos: totalDoPlacar(placar),
      votos: {
        rota: `/votacoes/${voting.id}/votos`,
        observacao:
          'A lista nominal é paginada em rota própria: incluí-la aqui significava até 513 objetos por votação.',
      },
    };
  }
}
