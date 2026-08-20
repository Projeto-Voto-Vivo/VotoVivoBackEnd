import { PrismaClient, VoteChoice } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { buildMeta, Pagination, TAMANHO_PAGINA_PADRAO } from '../lib/request-params';

export type VoteFilters = {
  /** Filtra por uma posição específica (ex.: só quem votou NAO). */
  voto?: VoteChoice;
};

export class VoteService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Lista nominal de votos, paginada. Era a última listagem sem `take` da API:
   * uma votação de plenário da Câmara devolvia 513 objetos de uma vez.
   */
  async listVotesByVoting(
    votingId: number,
    pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO },
    filters: VoteFilters = {},
  ) {
    await this.ensureVotingExists(votingId);

    const { page, limit } = pagination;
    const where = {
      votingId,
      ...(filters.voto ? { choice: filters.voto } : {}),
    };

    const [votes, total] = await Promise.all([
      this.prisma.vote.findMany({
        where,
        include: { parliamentarian: true },
        orderBy: [{ parliamentarian: { ballotName: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vote.count({ where }),
    ]);

    return {
      data: votes.map((v) => ({
        id: v.id,
        parlamentarId: v.parliamentarianId,
        parlamentar: v.parliamentarian.ballotName,
        siglaPartido: v.parliamentarian.currentParty,
        uf: v.parliamentarian.state,
        voto: v.choice,
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  private async ensureVotingExists(id: number) {
    const voting = await this.prisma.voting.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!voting) {
      throw new NotFoundError('Votação não encontrada.');
    }
  }
}
