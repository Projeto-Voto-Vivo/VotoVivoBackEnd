import { VoteService } from './vote.service';

describe('VoteService', () => {
  let prismaMock: any;
  let service: VoteService;

  beforeEach(() => {
    prismaMock = {
      vote: {
        findMany: jest.fn(),
      },
    };

    service = new VoteService(prismaMock);
  });

  describe('listVotesByVoting', () => {
    it('should return mapped votes for a voting', async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        { id: 1, parliamentarian: { ballotName: 'João da Silva' }, choice: 'SIM' },
        { id: 2, parliamentarian: { ballotName: 'Maria Santos' }, choice: 'NAO' },
      ]);

      const result = await service.listVotesByVoting(1);

      expect(prismaMock.vote.findMany).toHaveBeenCalledWith({
        where: { votingId: 1 },
        include: { parliamentarian: true },
      });

      expect(result).toEqual([
        { id: 1, parlamentar: 'João da Silva', voto: 'SIM' },
        { id: 2, parlamentar: 'Maria Santos', voto: 'NAO' },
      ]);
    });

    /**
     * O enum antigo (`SIM|NAO|ABSTENCAO|AUSENTE|SEM_REGISTRO|AUSENCIA_JUSTIFICADA`)
     * nao conhecia OBSTRUCAO nem NAO REGISTRADO, e o Prisma lanca erro ao ler um
     * valor de enum desconhecido: uma unica votacao com obstrucao derrubava a
     * rota inteira. Estes valores tem de atravessar o mapeamento intactos.
     */
    it('should pass the full canonical vote enum through', async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        { id: 1, parliamentarian: { ballotName: 'A' }, choice: 'OBSTRUCAO' },
        { id: 2, parliamentarian: { ballotName: 'B' }, choice: 'NAO_REGISTRADO' },
        { id: 3, parliamentarian: { ballotName: 'C' }, choice: 'AUSENCIA_JUSTIFICADA' },
      ]);

      const result = await service.listVotesByVoting(1);

      expect(result.map((vote) => vote.voto)).toEqual([
        'OBSTRUCAO',
        'NAO_REGISTRADO',
        'AUSENCIA_JUSTIFICADA',
      ]);
    });

    it('should return empty list when voting has no votes', async () => {
      prismaMock.vote.findMany.mockResolvedValue([]);

      const result = await service.listVotesByVoting(1);
      expect(result).toEqual([]);
    });
  });
});
