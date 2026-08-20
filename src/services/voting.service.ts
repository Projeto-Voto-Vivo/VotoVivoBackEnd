import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { buildMeta, Pagination, TAMANHO_PAGINA_PADRAO } from '../lib/request-params';

export class VotingService {
  constructor(private readonly prisma: PrismaClient) {}

  async listVotings(pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO }) {
    const { page, limit } = pagination;

    const [votings, total] = await Promise.all([
      this.prisma.voting.findMany({
        include: {
          proposition: { include: { propositionType: true } },
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

  async getVotingById(id: number) {
    const voting = await this.prisma.voting.findUnique({
      where: { id },
      include: {
        proposition: true,
        orientations: true,
        votes: {
          include: {
            parliamentarian: true,
          },
        },
      },
    });

    if (!voting) {
      throw new NotFoundError('Votação não encontrada.');
    }

    return {
      id: voting.id,
      casa: voting.casa,
      data: voting.votingDate,
      resumo: voting.subjectSummary,
      resultado: voting.finalResult,
      tipo: voting.votingType,
      orientacoes: voting.orientations.map((o) => ({
        bancada: o.bench,
        orientacao: o.orientation,
      })),
      votos: voting.votes.map((v) => ({
        parlamentar: v.parliamentarian?.ballotName,
        voto: v.choice,
      })),
    };
  }
}
