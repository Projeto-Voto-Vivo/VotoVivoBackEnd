import { PrismaClient } from '@prisma/client';

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
}
