import { PropositionService } from './proposition.service';
import { NotFoundError } from '../errors/http-errors';

describe('PropositionService', () => {
  let prismaMock: any;
  let service: PropositionService;

  beforeEach(() => {
    prismaMock = {
      proposition: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
    };

    service = new PropositionService(prismaMock);
  });

  describe('listPropositions', () => {
    it('should paginate and expose casa, dataApresentacao and temas', async () => {
      prismaMock.proposition.findMany.mockResolvedValue([
        {
          id: 2,
          house: 'Camara',
          propositionType: { sigla: 'PL' },
          number: '100',
          year: 2024,
          summary: 'Ementa',
          currentStatus: 'Em tramitação',
          presentationDate: new Date('2024-02-01T10:00:00Z'),
          temaProposicao: [{ tema: { descricao: 'Administração Pública' } }],
        },
      ]);
      prismaMock.proposition.count.mockResolvedValue(1);

      const result = await service.listPropositions({ page: 2, limit: 5 });

      // Nenhuma listagem pode varrer a tabela inteira.
      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
      expect(result.data[0]).toEqual({
        id: 2,
        casa: 'Camara',
        sigla: 'PL',
        numero: '100',
        ano: 2024,
        ementa: 'Ementa',
        situacao: 'Em tramitação',
        dataApresentacao: '2024-02-01',
        temas: ['Administração Pública'],
      });
      expect(result.meta).toEqual({ total: 1, page: 2, lastPage: 1, limit: 5 });
    });

    it('should default to the standard page size', async () => {
      prismaMock.proposition.findMany.mockResolvedValue([]);
      prismaMock.proposition.count.mockResolvedValue(0);

      const result = await service.listPropositions();

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.data).toEqual([]);
    });
  });

  describe('getPropositionById', () => {
    it('should return the proposition with its bicameral journey', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue({
        id: 1,
        house: 'Camara',
        propositionType: { sigla: 'PL' },
        number: '123',
        year: 2024,
        summary: 'Ementa',
        currentStatus: 'Em tramitação',
        presentationDate: new Date('2024-02-01T10:00:00Z'),
        temaProposicao: [],
        votings: [],
        relations: [
          {
            relationType: 'MESMA_MATERIA',
            related: {
              id: 9,
              house: 'Senado',
              number: '123',
              year: 2024,
              propositionType: { sigla: 'PL' },
            },
          },
        ],
      });

      const result = await service.getPropositionById(1);

      expect(result.jornada.mesmaMateria).toEqual([
        { id: 9, casa: 'Senado', sigla: 'PL', numero: '123', ano: 2024 },
      ]);
      expect(result.jornada.principal).toBeNull();
    });

    it('should throw NotFoundError when proposition does not exist', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(null);

      await expect(service.getPropositionById(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
