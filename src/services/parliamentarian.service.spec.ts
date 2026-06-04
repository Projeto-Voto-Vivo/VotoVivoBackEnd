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
        count: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      amendmentParliamentarian: {
        findMany: jest.fn(),
      },
      propositionAuthor: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      vote: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    service = new ParliamentarianService(prismaMock);
  });

  describe('listParliamentarians', () => {
    it('should return paginated parliamentarians with meta', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([
        {
          id: 1,
          role: 'Deputado Federal',
          ballotName: 'João da Silva',
          currentParty: 'PT',
          state: 'SP',
          photoUrl: 'https://example.com/joao.jpg',
        },
      ]);
      prismaMock.parliamentarian.count.mockResolvedValue(1);

      const result = await service.listParliamentarians({
        nome: 'João',
        partido: 'pt',
        uf: 'sp',
      });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { ballotName: { contains: 'João' } },
            { civilName: { contains: 'João' } },
          ],
          currentParty: 'PT',
          state: 'SP',
        },
        orderBy: { ballotName: 'asc' },
        select: {
          id: true,
          role: true,
          ballotName: true,
          currentParty: true,
          state: true,
          photoUrl: true,
        },
        skip: 0,
        take: 20,
      });

      expect(result).toEqual({
        data: [
          {
            id: 1,
            nomeParlamentar: 'João da Silva',
            siglaPartido: 'PT',
            uf: 'SP',
            urlFoto: 'https://example.com/joao.jpg',
            cargo: 'Deputado Federal',
          },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });
    });

    it('should paginate correctly for page 2', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([]);
      prismaMock.parliamentarian.count.mockResolvedValue(25);

      const result = await service.listParliamentarians({ pagina: 2 });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        lastPage: 2,
        limit: 20,
      });
    });

    it('should return empty data when no records found', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([]);
      prismaMock.parliamentarian.count.mockResolvedValue(0);

      const result = await service.listParliamentarians({});

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.lastPage).toBe(1);
    });
  });

  describe('getParliamentarianById', () => {
    it('should return parliamentarian details', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        id: 1,
        role: 'Deputado Federal',
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
          { platform: 'Instagram', url: 'https://instagram.com/joao' },
          { platform: 'X', url: 'https://x.com/joao' },
        ],
      });

      const result = await service.getParliamentarianById(1);

      expect(prismaMock.parliamentarian.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          role: true,
          ballotName: true,
          civilName: true,
          currentParty: true,
          state: true,
          photoUrl: true,
          birthDate: true,
          email: true,
          phone: true,
          officeAddress: true,
          socialNetworks: { select: { platform: true, url: true } },
        },
      });

      expect(result).toEqual({
        id: 1,
        nomeParlamentar: 'João da Silva',
        siglaPartido: 'PT',
        uf: 'SP',
        urlFoto: 'https://example.com/joao.jpg',
        cargo: 'Deputado Federal',
        nomeCivil: 'João Carlos da Silva',
        dataNascimento: '1980-05-10',
        email: 'joao@camara.leg.br',
        gabinete: { telefone: '(61) 3215-1001', endereco: 'Anexo IV, Gabinete 101' },
        redesSociais: [
          { rede: 'Instagram', url: 'https://instagram.com/joao' },
          { rede: 'X', url: 'https://x.com/joao' },
        ],
      });
    });

    it('should filter social networks with null platform or url', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        id: 1,
        role: null,
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
        { rede: 'Instagram', url: 'https://instagram.com/joao' },
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
    it('should return paginated expenses with meta', async () => {
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
      prismaMock.expense.count.mockResolvedValue(1);

      const result = await service.listExpensesByParliamentarianId(1, {
        pagina: 2,
      });

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );

      expect(result).toEqual({
        data: [
          {
            data: '2024-02-10',
            tipo: 'Hospedagem',
            fornecedor: 'Hotel Brasília',
            valor: 850,
            urlDocumento: 'https://example.com/invoice-1.pdf',
          },
        ],
        meta: { total: 1, page: 2, lastPage: 1, limit: 20 },
      });
    });

    it('should apply year and month filter', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([]);
      prismaMock.expense.count.mockResolvedValue(0);

      await service.listExpensesByParliamentarianId(1, {
        ano: 2024,
        mes: 2,
        pagina: 1,
      });

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            parliamentarianId: 1,
            expenseDate: {
              gte: new Date(2024, 1, 1),
              lt: new Date(2024, 2, 1),
            },
          },
        }),
      );
    });

    it('should use page 1 when page is invalid', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([]);
      prismaMock.expense.count.mockResolvedValue(0);

      await service.listExpensesByParliamentarianId(1, { pagina: 0 });

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
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
    it('should return DespesasPerfil with totals and categories', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.groupBy.mockResolvedValue([
        { category: 'Hospedagem', _sum: { amount: 850 } },
        { category: 'Divulgação da Atividade Parlamentar', _sum: { amount: 430.75 } },
      ]);
      prismaMock.expense.findMany.mockResolvedValue([
        { amount: 850 },
        { amount: 430.75 },
      ]);

      const result = await service.getExpenseSummaryByParliamentarianId(1);

      expect(result).toEqual({
        totalAno: 1280.75,
        mediaMensal: 1280.75 / 12,
        maiorReembolso: 850,
        categorias: [
          { tipoDespesa: 'Hospedagem', total: 850 },
          { tipoDespesa: 'Divulgação da Atividade Parlamentar', total: 430.75 },
        ],
      });
    });

    it('should use "Não informado" when category is null', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.groupBy.mockResolvedValue([
        { category: null, _sum: { amount: 100 } },
      ]);
      prismaMock.expense.findMany.mockResolvedValue([]);

      const result = await service.getExpenseSummaryByParliamentarianId(1);

      expect(result.categorias).toEqual([{ tipoDespesa: 'Não informado', total: 100 }]);
    });

    it('should return zeros when no year expenses found', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.groupBy.mockResolvedValue([]);
      prismaMock.expense.findMany.mockResolvedValue([]);

      const result = await service.getExpenseSummaryByParliamentarianId(1);

      expect(result.totalAno).toBe(0);
      expect(result.mediaMensal).toBe(0);
      expect(result.maiorReembolso).toBe(0);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.getExpenseSummaryByParliamentarianId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listAmendmentsByParliamentarianId', () => {
    it('should return list of amendments linked to parliamentarian', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([
        {
          amendmentId: 10,
          amendment: {
            id: 10,
            code: 'EMD-2024-001',
            year: 2024,
            amendmentType: 'Individual',
            author: 'AUTOR1',
            authorName: 'João da Silva',
            amendmentNumber: '001',
            spendingLocation: 'São Paulo - SP',
            functionName: 'Saúde',
            subfunctionName: 'Atenção Básica',
            committedAmount: 100000,
            liquidatedAmount: 80000,
            paidAmount: 80000,
            remainderRegistered: 20000,
            remainderCanceled: 0,
            remainderPaid: 20000,
          },
          linkMethod: 'exact',
          confidence: 0.95,
        },
      ]);

      const result = await service.listAmendmentsByParliamentarianId(1);

      expect(prismaMock.amendmentParliamentarian.findMany).toHaveBeenCalledWith({
        where: { parliamentarianId: 1 },
        orderBy: { amendmentId: 'asc' },
        include: { amendment: true },
      });

      expect(result).toEqual([
        {
          id: 10,
          codigoEmenda: 'EMD-2024-001',
          ano: 2024,
          tipoEmenda: 'Individual',
          autor: 'AUTOR1',
          nomeAutor: 'João da Silva',
          numeroEmenda: '001',
          localidadeDoGasto: 'São Paulo - SP',
          funcao: 'Saúde',
          subfuncao: 'Atenção Básica',
          valorEmpenhado: 100000,
          valorLiquidado: 80000,
          valorPago: 80000,
          valorRestoInscrito: 20000,
          valorRestoCancelado: 0,
          valorRestoPago: 20000,
          metodoVinculo: 'exact',
          confiancaVinculo: 0.95,
        },
      ]);
    });

    it('should use 0 for null monetary values', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([
        {
          amendmentId: 10,
          amendment: {
            id: 10,
            code: 'EMD-2024-001',
            year: null,
            amendmentType: null,
            author: null,
            authorName: null,
            amendmentNumber: null,
            spendingLocation: null,
            functionName: null,
            subfunctionName: null,
            committedAmount: null,
            liquidatedAmount: null,
            paidAmount: null,
            remainderRegistered: null,
            remainderCanceled: null,
            remainderPaid: null,
          },
          linkMethod: null,
          confidence: null,
        },
      ]);

      const result = await service.listAmendmentsByParliamentarianId(1);

      expect(result[0].valorEmpenhado).toBe(0);
      expect(result[0].confiancaVinculo).toBe(0);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listAmendmentsByParliamentarianId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getAmendmentSummaryByParliamentarianId', () => {
    it('should return summed totals across all amendments', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([
        { amendmentId: 10, amendment: { committedAmount: 100000, liquidatedAmount: 80000, paidAmount: 80000 } },
        { amendmentId: 11, amendment: { committedAmount: 50000, liquidatedAmount: 40000, paidAmount: 40000 } },
      ]);

      const result = await service.getAmendmentSummaryByParliamentarianId(1);

      expect(result).toEqual({
        totalEmendas: 2,
        totalEmpenhado: 150000,
        totalLiquidado: 120000,
        totalPago: 120000,
      });
    });

    it('should return zeros when no amendments found', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([]);

      const result = await service.getAmendmentSummaryByParliamentarianId(1);

      expect(result).toEqual({ totalEmendas: 0, totalEmpenhado: 0, totalLiquidado: 0, totalPago: 0 });
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.getAmendmentSummaryByParliamentarianId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listPropositionsByParliamentarianId', () => {
    it('should return paginated propositions authored by parliamentarian', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.propositionAuthor.findMany.mockResolvedValue([
        {
          proposition: {
            id: 5,
            typeAbbreviation: 'PL',
            number: 123,
            year: 2024,
            summary: 'Dispõe sobre o uso de energias renováveis.',
            currentStatus: 'Em tramitação',
          },
        },
      ]);
      prismaMock.propositionAuthor.count.mockResolvedValue(1);

      const result = await service.listPropositionsByParliamentarianId(1, {
        pagina: 1,
      });

      expect(prismaMock.propositionAuthor.findMany).toHaveBeenCalledWith({
        where: { parliamentarianId: 1 },
        include: { proposition: true },
        skip: 0,
        take: 20,
      });

      expect(result).toEqual({
        data: [
          {
            id: 5,
            sigla: 'PL',
            numero: 123,
            ano: 2024,
            ementa: 'Dispõe sobre o uso de energias renováveis.',
            situacao: 'Em tramitação',
          },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });
    });

    it('should return second page correctly', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.propositionAuthor.findMany.mockResolvedValue([]);
      prismaMock.propositionAuthor.count.mockResolvedValue(30);

      const result = await service.listPropositionsByParliamentarianId(1, {
        pagina: 2,
      });

      expect(prismaMock.propositionAuthor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.meta).toEqual({ total: 30, page: 2, lastPage: 2, limit: 20 });
    });

    it('should return empty list when parliamentarian has no propositions', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.propositionAuthor.findMany.mockResolvedValue([]);
      prismaMock.propositionAuthor.count.mockResolvedValue(0);

      const result = await service.listPropositionsByParliamentarianId(1, {});

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.lastPage).toBe(1);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listPropositionsByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listVotingsByParliamentarianId', () => {
    it('should return paginated votings for parliamentarian', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([
        {
          choice: 'YES',
          voting: {
            id: 10,
            votingDate: new Date('2024-03-15T00:00:00.000Z'),
            subjectSummary: 'Votação sobre PL 123/2024',
            finalResult: 'Aprovado',
            votingType: 'Nominal',
          },
        },
      ]);
      prismaMock.vote.count.mockResolvedValue(1);

      const result = await service.listVotingsByParliamentarianId(1, {
        pagina: 1,
      });

      expect(prismaMock.vote.findMany).toHaveBeenCalledWith({
        where: { parliamentarianId: 1 },
        include: { voting: true },
        orderBy: { voting: { votingDate: 'desc' } },
        skip: 0,
        take: 20,
      });

      expect(result).toEqual({
        data: [
          {
            id: 10,
            data: '2024-03-15',
            resumo: 'Votação sobre PL 123/2024',
            voto: 'YES',
            resultado: 'Aprovado',
            tipo: 'Nominal',
          },
        ],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });
    });

    it('should return null data when votingDate is null', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([
        {
          choice: 'ABSENT',
          voting: {
            id: 11,
            votingDate: null,
            subjectSummary: null,
            finalResult: null,
            votingType: null,
          },
        },
      ]);
      prismaMock.vote.count.mockResolvedValue(1);

      const result = await service.listVotingsByParliamentarianId(1, {});

      expect(result.data[0].data).toBeNull();
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listVotingsByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getPresenceByParliamentarianId', () => {
    it('should calculate presence rate from votes', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([
        { choice: 'YES' },
        { choice: 'NO' },
        { choice: 'ABSTENTION' },
        { choice: 'ABSENT' },
        { choice: 'ABSENT' },
      ]);

      const result = await service.getPresenceByParliamentarianId(1);

      expect(prismaMock.vote.findMany).toHaveBeenCalledWith({
        where: { parliamentarianId: 1 },
        select: { choice: true },
      });

      expect(result).toEqual({
        presenca: {
          sessoesDeliberativas: {
            taxa: 60.0,
            totalEventos: 5,
            faltas: 2,
          },
          naoSessoesDeliberativas: {
            taxa: 0,
            totalEventos: 0,
            faltas: 0,
          },
        },
      });
    });

    it('should return 0% when all votes are absent', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([
        { choice: 'ABSENT' },
        { choice: 'ABSENT' },
      ]);

      const result = await service.getPresenceByParliamentarianId(1);

      expect(result.presenca.sessoesDeliberativas.taxa).toBe(0);
      expect(result.presenca.sessoesDeliberativas.faltas).toBe(2);
    });

    it('should return 0 taxa when parliamentarian has no votes', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([]);

      const result = await service.getPresenceByParliamentarianId(1);

      expect(result.presenca.sessoesDeliberativas).toEqual({
        taxa: 0,
        totalEventos: 0,
        faltas: 0,
      });
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.getPresenceByParliamentarianId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getAggregatedProfile', () => {
    beforeEach(() => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        id: 1,
        role: 'Deputado Federal',
        ballotName: 'João da Silva',
        civilName: 'João Carlos da Silva',
        currentParty: 'PT',
        state: 'SP',
        photoUrl: 'https://example.com/joao.jpg',
        birthDate: new Date('1980-05-10T00:00:00.000Z'),
        email: 'joao@camara.leg.br',
        phone: '(61) 3215-1001',
        officeAddress: 'Anexo IV, Gabinete 101',
        socialNetworks: [],
      });
      prismaMock.vote.findMany.mockResolvedValue([]);
      prismaMock.vote.count.mockResolvedValue(0);
      prismaMock.propositionAuthor.findMany.mockResolvedValue([]);
      prismaMock.propositionAuthor.count.mockResolvedValue(0);
      prismaMock.expense.groupBy.mockResolvedValue([]);
      prismaMock.expense.findMany.mockResolvedValue([]);
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([]);
    });

    it('should return aggregated profile with all sections', async () => {
      const result = await service.getAggregatedProfile(1);

      expect(result).toMatchObject({
        visaoGeral: expect.objectContaining({ id: 1, nomeParlamentar: 'João da Silva' }),
        votacoes: expect.objectContaining({
          presenca: expect.objectContaining({ sessoesDeliberativas: expect.any(Object) }),
          recentes: expect.any(Array),
        }),
        proposicoes: expect.objectContaining({
          total: 0,
          aprovadas: 0,
          recentes: expect.any(Array),
        }),
        despesas: expect.objectContaining({
          totalAno: 0,
          mediaMensal: 0,
          maiorReembolso: 0,
          categorias: expect.any(Array),
        }),
        emendas: expect.objectContaining({
          totalEmendas: 0,
          totalEmpenhado: 0,
        }),
      });
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(service.getAggregatedProfile(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
