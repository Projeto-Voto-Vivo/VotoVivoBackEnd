import { PrismaClient, VoteChoice } from '@prisma/client';
import { NotFoundError } from './parliamentarian.service';

export class VoteService {
  constructor(private readonly prisma: PrismaClient) {}

  async listVotesByVoting(votingId: number) {
    const votes = await this.prisma.vote.findMany({
      where: { votingId },
      include: {
        parliamentarian: true,
      },
    });

    return votes.map((v) => ({
      id: v.id,
      parlamentar: v.parliamentarian.ballotName,
      voto: v.choice,
    }));
  }

  async createVote(data: {
    parliamentarianId: number;
    votingId: number;
    choice: VoteChoice;
		idApi: string,
  }) {
    return this.prisma.vote.create({ data });
  }

  async deleteVote(id: number) {
    const vote = await this.prisma.vote.findUnique({ where: { id } });

    if (!vote) {
      throw new NotFoundError('Voto não encontrado.');
    }

    return this.prisma.vote.delete({ where: { id } });
  }
}
