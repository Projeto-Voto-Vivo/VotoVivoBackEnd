import { PropositionService } from './proposition.service';

describe('PropositionService', () => {
  let prismaMock: any;
  let service: PropositionService;

  beforeEach(() => {
    prismaMock = {
      proposition: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new PropositionService(prismaMock);
  });

  describe('listPropositions', () => {
    it('should return propositions ordered by year descending', async () => {
      const propositions = [
        { id: 2, typeAbbreviation: 'PL', number: 100, year: 2024 },
        { id: 1, typeAbbreviation: 'PEC', number: 10, year: 2023 },
      ];
      prismaMock.proposition.findMany.mockResolvedValue(propositions);

      const result = await service.listPropositions();

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith({
        orderBy: { year: 'desc' },
      });
      expect(result).toEqual(propositions);
    });

    it('should return empty list when no propositions exist', async () => {
      prismaMock.proposition.findMany.mockResolvedValue([]);

      const result = await service.listPropositions();
      expect(result).toEqual([]);
    });
  });

  describe('getPropositionById', () => {
    it('should return proposition with votings', async () => {
      const proposition = {
        id: 1,
        typeAbbreviation: 'PL',
        number: 123,
        year: 2024,
        votings: [{ id: 1, finalResult: 'Aprovado' }],
      };
      prismaMock.proposition.findUnique.mockResolvedValue(proposition);

      const result = await service.getPropositionById(1);

      expect(prismaMock.proposition.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { votings: true },
      });
      expect(result).toEqual(proposition);
    });

    it('should return null when proposition does not exist', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(null);

      const result = await service.getPropositionById(999);
      expect(result).toBeNull();
    });
  });

  describe('createProposition', () => {
    it('should create and return a proposition', async () => {
      const data = { apiId: 100, typeAbbreviation: 'PL', number: 1, year: 2024 };
      prismaMock.proposition.create.mockResolvedValue({ id: 1, ...data });

      const result = await service.createProposition(data);

      expect(prismaMock.proposition.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: 1, ...data });
    });
  });
});
