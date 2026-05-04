import { PrismaClient } from '@prisma/client';

export class PropositionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listPropositions() {
    return this.prisma.proposition.findMany({
      orderBy: { year: 'desc' },
    });
  }

  async getPropositionById(id: number) {
    return this.prisma.proposition.findUnique({
      where: { id },
      include: {
        votings: true,
      },
    });
  }

  async createProposition(data: any) {
    return this.prisma.proposition.create({ data });
  }
}