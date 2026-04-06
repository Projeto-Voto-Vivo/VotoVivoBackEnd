import {
  NotFoundError,
  ParliamentarianService,
} from './parliamentarian.service';

describe('ParliamentarianService', () => {
  let prismaMock: any;
  let service: ParliamentarianService;

  beforeEach(() => {
    prismaMock = {
      parliamentarian: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    service = new ParliamentarianService(prismaMock);
  });

  describe('listParliamentarians', () => {
    it('should list parliamentarians with correct mapping', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([
        {
          id: 1,
          ballotName: 'João da Silva',
          currentParty: 'PT',
          state: 'SP',
          photoUrl: 'https://example.com/joao.jpg',
        },
      ]);

      const result = await service.listParliamentarians({
        nome: 'João',
        partido: 'pt',
        uf: 'sp',
      });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              ballotName: {
                contains: 'João',
              },
            },
            {
              civilName: {
                contains: 'João',
              },
            },
          ],
          currentParty: 'PT',
          state: 'SP',
        },
        orderBy: {
          ballotName: 'asc',
        },
        select: {
          id: true,
          ballotName: true,
          currentParty: true,
          state: true,
          photoUrl: true,
        },
      });

      expect(result).toEqual([
        {
          id: 1,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          urlFoto: 'https://example.com/joao.jpg',
        },
      ]);
    });

    it('should return an empty list when no records are found', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([]);

      const result = await service.listParliamentarians({});

      expect(result).toEqual([]);
    });
  });

  describe('getParliamentarianById', () => {
    it('should return parliamentarian details', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        id: 1,
        ballotName: 'João da Silva',
        civilName: 'João Carlos da Silva',
        currentParty: 'PT',
        state: 'SP',
        photoUrl: 'https://example.com/joao.jpg',
        birthDate: new Date('1980-05-10T00:00:00.000Z'),
        email: 'joao@camara.leg.br',
        phone: '(61) 3215-1001',
        officeAddress: 'Anexo IV, Gabinete 101',
        socialNetworks: [
          {
            platform: 'Instagram',
            url: 'https://instagram.com/joao',
          },
          {
            platform: 'X',
            url: 'https://x.com/joao',
          },
        ],
      });

      const result = await service.getParliamentarianById(1);

      expect(prismaMock.parliamentarian.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          ballotName: true,
          civilName: true,
          currentParty: true,
          state: true,
          photoUrl: true,
          birthDate: true,
          email: true,
          phone: true,
          officeAddress: true,
          socialNetworks: {
            select: {
              platform: true,
              url: true,
            },
          },
        },
      });

      expect(result).toEqual({
        id: 1,
        nomeParlamentar: 'João da Silva',
        siglaPartido: 'PT',
        uf: 'SP',
        urlFoto: 'https://example.com/joao.jpg',
        nomeCivil: 'João Carlos da Silva',
        dataNascimento: '1980-05-10',
        email: 'joao@camara.leg.br',
        gabinete: {
          telefone: '(61) 3215-1001',
          endereco: 'Anexo IV, Gabinete 101',
        },
        redesSociais: [
          {
            rede: 'Instagram',
            url: 'https://instagram.com/joao',
          },
          {
            rede: 'X',
            url: 'https://x.com/joao',
          },
        ],
      });
    });

    it('should filter invalid social networks', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        id: 1,
        ballotName: 'João da Silva',
        civilName: 'João Carlos da Silva',
        currentParty: 'PT',
        state: 'SP',
        photoUrl: 'https://example.com/joao.jpg',
        birthDate: null,
        email: 'joao@camara.leg.br',
        phone: '(61) 3215-1001',
        officeAddress: 'Anexo IV, Gabinete 101',
        socialNetworks: [
          { platform: 'Instagram', url: 'https://instagram.com/joao' },
          { platform: null, url: 'https://x.com/joao' },
          { platform: 'X', url: null },
        ],
      });

      const result = await service.getParliamentarianById(1);

      expect(result.redesSociais).toEqual([
        {
          rede: 'Instagram',
          url: 'https://instagram.com/joao',
        },
      ]);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(service.getParliamentarianById(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('listExpensesByParliamentarianId', () => {
    it('should list paginated expenses', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([
        {
          expenseDate: new Date('2024-02-10T00:00:00.000Z'),
          category: 'Hospedagem',
          supplierName: 'Hotel Brasília',
          amount: 850,
          invoiceUrl: 'https://example.com/invoice-1.pdf',
        },
      ]);

      const result = await service.listExpensesByParliamentarianId(1, {
        pagina: 2,
      });

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          parliamentarianId: 1,
        },
        orderBy: {
          expenseDate: 'desc',
        },
        skip: 20,
        take: 20,
        select: {
          expenseDate: true,
          category: true,
          supplierName: true,
          amount: true,
          invoiceUrl: true,
        },
      });

      expect(result).toEqual([
        {
          data: '2024-02-10',
          tipo: 'Hospedagem',
          fornecedor: 'Hotel Brasília',
          valor: 850,
          urlDocumento: 'https://example.com/invoice-1.pdf',
        },
      ]);
    });

    it('should apply year and month filter', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([]);

      await service.listExpensesByParliamentarianId(1, {
        ano: 2024,
        mes: 2,
        pagina: 1,
      });

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
        where: {
          parliamentarianId: 1,
          expenseDate: {
            gte: new Date(2024, 1, 1),
            lt: new Date(2024, 2, 1),
          },
        },
        orderBy: {
          expenseDate: 'desc',
        },
        skip: 0,
        take: 20,
        select: {
          expenseDate: true,
          category: true,
          supplierName: true,
          amount: true,
          invoiceUrl: true,
        },
      });
    });

    it('should use page 1 when page is invalid', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([]);

      await service.listExpensesByParliamentarianId(1, {
        pagina: 0,
      });

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listExpensesByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getExpenseSummaryByParliamentarianId', () => {
    it('should return expense summary grouped by category', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.groupBy.mockResolvedValue([
        {
          category: 'Hospedagem',
          _sum: {
            amount: 850,
          },
        },
        {
          category: 'Divulgação da Atividade Parlamentar',
          _sum: {
            amount: 430.75,
          },
        },
      ]);

      const result = await service.getExpenseSummaryByParliamentarianId(1);

      expect(prismaMock.expense.groupBy).toHaveBeenCalledWith({
        by: ['category'],
        where: {
          parliamentarianId: 1,
        },
        _sum: {
          amount: true,
        },
        orderBy: {
          category: 'asc',
        },
      });

      expect(result).toEqual([
        {
          tipoDespesa: 'Hospedagem',
          total: 850,
        },
        {
          tipoDespesa: 'Divulgação da Atividade Parlamentar',
          total: 430.75,
        },
      ]);
    });

    it('should use "Não informado" when category is null', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.groupBy.mockResolvedValue([
        {
          category: null,
          _sum: {
            amount: 100,
          },
        },
      ]);

      const result = await service.getExpenseSummaryByParliamentarianId(1);

      expect(result).toEqual([
        {
          tipoDespesa: 'Não informado',
          total: 100,
        },
      ]);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.getExpenseSummaryByParliamentarianId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
