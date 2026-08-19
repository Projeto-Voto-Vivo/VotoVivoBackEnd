import { VoteService } from './vote.service';
import { NotFoundError } from './parliamentarian.service';

describe('VoteService', () => {
  let prismaMock: any;
  let service: VoteService;

  beforeEach(() => {
    prismaMock = {
      vote: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    service = new VoteService(prismaMock);
  });

  describe('listVotesByVoting', () => {
    it('should return mapped votes for a voting', async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        {
          id: 1,
          parliamentarian: { ballotName: 'João da Silva' },
          choice: 'YES',
        },
        {
          id: 2,
          parliamentarian: { ballotName: 'Maria Santos' },
          choice: 'NO',
        },
      ]);

      const result = await service.listVotesByVoting(1);

      expect(prismaMock.vote.findMany).toHaveBeenCalledWith({
        where: { votingId: 1 },
        include: { parliamentarian: true },
      });

      expect(result).toEqual([
        { id: 1, parlamentar: 'João da Silva', voto: 'YES' },
        { id: 2, parlamentar: 'Maria Santos', voto: 'NO' },
      ]);
    });

    it('should return empty list when voting has no votes', async () => {
      prismaMock.vote.findMany.mockResolvedValue([]);

      const result = await service.listVotesByVoting(1);
      expect(result).toEqual([]);
    });
  });

  describe('createVote', () => {
    it('should create and return a vote', async () => {
      const data = {
        parliamentarianId: 1,
        votingId: 2,
        choice: 'YES' as any,
				idApi: 'teste-mock-123',
      };
      prismaMock.vote.create.mockResolvedValue({ id: 10, ...data });

      const result = await service.createVote(data);

      expect(prismaMock.vote.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: 10, ...data });
    });
  });

  describe('deleteVote', () => {
    it('should delete and return the vote', async () => {
      const existingVote = {
        id: 1,
        parliamentarianId: 1,
        votingId: 2,
        choice: 'YES',
      };
      prismaMock.vote.findUnique.mockResolvedValue(existingVote);
      prismaMock.vote.delete.mockResolvedValue(existingVote);

      const result = await service.deleteVote(1);

      expect(prismaMock.vote.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(prismaMock.vote.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(existingVote);
    });

    it('should throw NotFoundError when vote does not exist', async () => {
      prismaMock.vote.findUnique.mockResolvedValue(null);

      await expect(service.deleteVote(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );

      expect(prismaMock.vote.delete).not.toHaveBeenCalled();
    });
  });
});
