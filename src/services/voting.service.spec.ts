import { VotingService } from './voting.service';
import { NotFoundError } from './parliamentarian.service';

describe('VotingService', () => {
  let prismaMock: any;
  let service: VotingService;

  beforeEach(() => {
    prismaMock = {
      voting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new VotingService(prismaMock);
  });

  describe('listVotings', () => {
    it('should return mapped votings with proposition details', async () => {
      prismaMock.voting.findMany.mockResolvedValue([
        {
          id: 1,
          apiId: 101,
          votingDate: new Date('2024-03-15'),
          subjectSummary: 'Votação sobre PL 123/2024',
          finalResult: 'Aprovado',
          votingType: 'Nominal',
          proposition: {
            id: 10,
            typeAbbreviation: 'PL',
            number: 123,
            year: 2024,
          },
        },
      ]);

      const result = await service.listVotings();

      expect(prismaMock.voting.findMany).toHaveBeenCalledWith({
        include: { proposition: true },
        orderBy: { votingDate: 'desc' },
      });

      expect(result).toEqual([
        {
          id: 1,
          apiId: 101,
          data: new Date('2024-03-15'),
          resumo: 'Votação sobre PL 123/2024',
          resultado: 'Aprovado',
          tipo: 'Nominal',
          proposicao: {
            id: 10,
            tipo: 'PL',
            numero: 123,
            ano: 2024,
          },
        },
      ]);
    });

    it('should return null proposicao when proposition is null', async () => {
      prismaMock.voting.findMany.mockResolvedValue([
        {
          id: 2,
          apiId: 102,
          votingDate: null,
          subjectSummary: null,
          finalResult: null,
          votingType: null,
          proposition: null,
        },
      ]);

      const result = await service.listVotings();

      expect(result[0].proposicao).toBeNull();
    });

    it('should return empty list when no votings exist', async () => {
      prismaMock.voting.findMany.mockResolvedValue([]);

      const result = await service.listVotings();
      expect(result).toEqual([]);
    });
  });

  describe('getVotingById', () => {
    it('should return voting details with votes', async () => {
      prismaMock.voting.findUnique.mockResolvedValue({
        id: 1,
        votingDate: new Date('2024-03-15'),
        subjectSummary: 'Votação sobre PL 123/2024',
        finalResult: 'Aprovado',
        votingType: 'Nominal',
        proposition: null,
        votes: [
          {
            parliamentarian: { ballotName: 'João da Silva' },
            choice: 'YES',
          },
          {
            parliamentarian: { ballotName: 'Maria Santos' },
            choice: 'NO',
          },
        ],
      });

      const result = await service.getVotingById(1);

      expect(prismaMock.voting.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          proposition: true,
          votes: {
            include: { parliamentarian: true },
          },
        },
      });

      expect(result).toEqual({
        id: 1,
        data: new Date('2024-03-15'),
        resumo: 'Votação sobre PL 123/2024',
        resultado: 'Aprovado',
        tipo: 'Nominal',
        votos: [
          { parlamentar: 'João da Silva', voto: 'YES' },
          { parlamentar: 'Maria Santos', voto: 'NO' },
        ],
      });
    });

    it('should throw NotFoundError when voting does not exist', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(null);

      await expect(service.getVotingById(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('createVoting', () => {
    it('should create and return a voting', async () => {
      const data = { apiId: 200, subjectSummary: 'Nova votação' };
      prismaMock.voting.create.mockResolvedValue({ id: 5, ...data });

      const result = await service.createVoting(data);

      expect(prismaMock.voting.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: 5, ...data });
    });
  });
});
