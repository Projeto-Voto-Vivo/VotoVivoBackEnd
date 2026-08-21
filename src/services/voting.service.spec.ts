import { VotingService } from './voting.service';
import { NotFoundError } from '../errors/http-errors';

describe('VotingService', () => {
  let prismaMock: any;
  let service: VotingService;

  beforeEach(() => {
    prismaMock = {
      voting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      vote: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    service = new VotingService(prismaMock);
  });

  describe('listVotings', () => {
    it('should return mapped votings with proposition and orgao', async () => {
      prismaMock.voting.findMany.mockResolvedValue([
        {
          id: 1,
          apiId: '101',
          casa: 'Camara',
          votingDate: new Date('2024-03-15'),
          subjectSummary: 'Votação sobre PL 123/2024',
          finalResult: 'Aprovado',
          votingType: 'NOMINAL',
          orgao: {
            idOrgao: 4,
            sigla: 'CCJC',
            nome: 'Comissão de Constituição e Justiça',
            tipoOrgao: 'Comissão Permanente',
            casa: 'Camara',
          },
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

      expect(result.data[0].orgao).toEqual({
        id: 4,
        sigla: 'CCJC',
        nome: 'Comissão de Constituição e Justiça',
        tipoOrgao: 'Comissão Permanente',
        casa: 'Camara',
      });
      expect(result.data[0].proposicao).toEqual({
        id: 10,
        tipo: 'PL',
        numero: '123',
        ano: 2024,
      });
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        lastPage: 1,
        limit: 20,
        temProximaPagina: false,
      });
    });

    it('should return null proposicao and orgao when absent', async () => {
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
          orgao: null,
        },
      ]);
      prismaMock.voting.count.mockResolvedValue(1);

      const result = await service.listVotings();

      expect(result.data[0].proposicao).toBeNull();
      expect(result.data[0].orgao).toBeNull();
    });

    it('should apply skip/take from the pagination', async () => {
      await service.listVotings({ page: 3, limit: 10 });

      expect(prismaMock.voting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('getVotingById', () => {
    const votacao = (overrides: Record<string, unknown> = {}) => ({
      id: 1,
      apiId: '3001',
      casa: 'Camara',
      votingDate: new Date('2024-03-15'),
      subjectSummary: 'Votação sobre PL 123/2024',
      finalResult: 'Aprovado',
      votingType: 'NOMINAL',
      proposition: null,
      orgao: null,
      orientations: [{ bench: 'PT', orientation: 'Sim' }],
      ...overrides,
    });

    /**
     * O placar sai de um `groupBy` no banco. Antes, a única forma de montá-lo
     * era baixar a lista inteira de votos — até 513 objetos por votação — o que
     * obrigava o cliente a limitar quantas votações detalhava.
     */
    it('should aggregate the tally in the database', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(votacao());
      prismaMock.vote.groupBy.mockResolvedValue([
        { choice: 'SIM', _count: { _all: 312 } },
        { choice: 'NAO', _count: { _all: 121 } },
        { choice: 'OBSTRUCAO', _count: { _all: 24 } },
      ]);

      const result = await service.getVotingById(1);

      expect(prismaMock.vote.groupBy).toHaveBeenCalledWith({
        by: ['choice'],
        where: { votingId: 1 },
        _count: { _all: true },
      });
      expect(result.placar).toEqual({
        SIM: 312,
        NAO: 121,
        ABSTENCAO: 0,
        OBSTRUCAO: 24,
        AUSENCIA_JUSTIFICADA: 0,
        AUSENTE: 0,
        NAO_REGISTRADO: 0,
      });
      expect(result.totalVotos).toBe(457);
    });

    /** Chave ausente obrigaria o cliente a tratar undefined como zero. */
    it('should always return the seven canonical keys', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(votacao());

      const result = await service.getVotingById(1);

      expect(Object.keys(result.placar)).toEqual([
        'SIM',
        'NAO',
        'ABSTENCAO',
        'OBSTRUCAO',
        'AUSENCIA_JUSTIFICADA',
        'AUSENTE',
        'NAO_REGISTRADO',
      ]);
      expect(result.totalVotos).toBe(0);
    });

    it('should expose the orgao of the voting', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(
        votacao({
          orgao: {
            idOrgao: 4,
            sigla: 'CCJC',
            nome: 'Comissão de Constituição e Justiça',
            tipoOrgao: 'Comissão Permanente',
            casa: 'Camara',
          },
        }),
      );

      const result = await service.getVotingById(1);

      expect(result.orgao?.sigla).toBe('CCJC');
    });

    /** A lista nominal saiu do detalhe e virou rota paginada própria. */
    it('should point to the paginated nominal list instead of inlining it', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(votacao());

      const result = await service.getVotingById(1);

      expect(result.votos).toEqual(
        expect.objectContaining({ rota: '/votacoes/1/votos' }),
      );
      expect(Array.isArray(result.votos)).toBe(false);
    });

    it('should keep bench orientations', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(votacao());

      const result = await service.getVotingById(1);

      expect(result.orientacoes).toEqual([{ bancada: 'PT', orientacao: 'Sim' }]);
    });

    it('should throw NotFoundError when voting does not exist', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(null);

      await expect(service.getVotingById(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(prismaMock.vote.groupBy).not.toHaveBeenCalled();
    });
  });
});
