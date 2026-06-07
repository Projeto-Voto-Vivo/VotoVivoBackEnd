import { PrismaClient } from '@prisma/client';
import { NotFoundError } from './parliamentarian.service';

export class VotingService {
  constructor(private readonly prisma: PrismaClient) {}

  async listVotings() {
    const votings = await this.prisma.voting.findMany({
      include: {
        proposition: { include: { propositionType: true } },
      },
      orderBy: {
        votingDate: 'desc',
      },
    });

    return votings.map((v) => ({
      id: v.id,
      apiId: v.apiId,
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
    }));
  }

  async getVotingById(id: number) {
    const voting = await this.prisma.voting.findUnique({
      where: { id },
      include: {
        proposition: true,
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
      data: voting.votingDate,
      resumo: voting.subjectSummary,
      resultado: voting.finalResult,
      tipo: voting.votingType,
      votos: voting.votes.map((v) => ({
        parlamentar: v.parliamentarian?.ballotName,
        voto: v.choice,
      })),
    };
  }

  async createVoting(data: any) {
    return this.prisma.voting.create({ data });
  }
}