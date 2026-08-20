import { VotingService } from './voting.service';
import { NotFoundError } from '../errors/http-errors';

describe('VotingService', () => {
  let prismaMock: any;
  let service: VotingService;

  beforeEach(() => {
    prismaMock = {
      voting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
    };

    service = new VotingService(prismaMock);
  });

  describe('listVotings', () => {
    it('should return mapped votings with proposition details', async () => {
      prismaMock.voting.findMany.mockResolvedValue([
        {
          id: 1,
          apiId: '101',
          casa: 'Camara',
          votingDate: new Date('2024-03-15'),
          subjectSummary: 'Votação sobre PL 123/2024',
          finalResult: 'Aprovado',
          votingType: 'NOMINAL',
          proposition: {
            id: 10,
            propositionType: { sigla: 'PL' },
            number: '123',
            year: 2024,
          },
        },
      ]);
      prismaMock.voting.count.mockResolvedValue(1);

      const result = await service.listVotings({ page: 1, limit: 20 });

      expect(prismaMock.voting.findMany).toHaveBeenCalledWith({
        include: { proposition: { include: { propositionType: true } } },
        orderBy: { votingDate: 'desc' },
        skip: 0,
        take: 20,
      });

      expect(result.data).toEqual([
        {
          id: 1,
          apiId: '101',
          casa: 'Camara',
          data: new Date('2024-03-15'),
          resumo: 'Votação sobre PL 123/2024',
          resultado: 'Aprovado',
          tipo: 'NOMINAL',
          proposicao: { id: 10, tipo: 'PL', numero: '123', ano: 2024 },
        },
      ]);
      expect(result.meta).toEqual({ total: 1, page: 1, lastPage: 1, limit: 20 });
    });

    it('should return null proposicao when proposition is null', async () => {
      prismaMock.voting.findMany.mockResolvedValue([
        {
          id: 2,
          apiId: '102',
          casa: 'Senado',
          votingDate: null,
          subjectSummary: null,
          finalResult: null,
          votingType: null,
          proposition: null,
        },
      ]);
      prismaMock.voting.count.mockResolvedValue(1);

      const result = await service.listVotings();

      expect(result.data[0].proposicao).toBeNull();
    });

    it('should apply skip/take from the pagination', async () => {
      prismaMock.voting.findMany.mockResolvedValue([]);
      prismaMock.voting.count.mockResolvedValue(0);

      const result = await service.listVotings({ page: 3, limit: 10 });

      expect(prismaMock.voting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.data).toEqual([]);
    });
  });

  describe('getVotingById', () => {
    it('should return voting details with votes and bench orientations', async () => {
      prismaMock.voting.findUnique.mockResolvedValue({
        id: 1,
        casa: 'Camara',
        votingDate: new Date('2024-03-15'),
        subjectSummary: 'Votação sobre PL 123/2024',
        finalResult: 'Aprovado',
        votingType: 'NOMINAL',
        proposition: null,
        orientations: [{ bench: 'PT', orientation: 'Sim' }],
        votes: [
          { parliamentarian: { ballotName: 'João da Silva' }, choice: 'SIM' },
          { parliamentarian: { ballotName: 'Maria Santos' }, choice: 'OBSTRUCAO' },
        ],
      });

      const result = await service.getVotingById(1);

      expect(result).toEqual({
        id: 1,
        casa: 'Camara',
        data: new Date('2024-03-15'),
        resumo: 'Votação sobre PL 123/2024',
        resultado: 'Aprovado',
        tipo: 'NOMINAL',
        orientacoes: [{ bancada: 'PT', orientacao: 'Sim' }],
        votos: [
          { parlamentar: 'João da Silva', voto: 'SIM' },
          { parlamentar: 'Maria Santos', voto: 'OBSTRUCAO' },
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
});
