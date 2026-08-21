import { NotFoundError, ParliamentarianService } from './parliamentarian.service';
import { InvalidParameterError } from '../errors/http-errors';

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
        findFirst: jest.fn(),
        groupBy: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      amendment: {
        aggregate: jest.fn(),
      },
      amendmentParliamentarian: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      propositionAuthor: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      orgaoMembership: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      mandateTerm: {
        findMany: jest.fn(),
      },
      partyAffiliation: {
        count: jest.fn(),
      },
      presence: {
        findMany: jest.fn(),
      },
      vote: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    service = new ParliamentarianService(prismaMock);
  });

  describe('listParliamentarians', () => {
    it('should return paginated parliamentarians with meta', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([
        {
          id: 1,
          role: 'Deputado(a)',
          ballotName: 'João da Silva',
          currentParty: 'PT',
          state: 'SP',
          photoUrl: 'https://example.com/joao.jpg',
          mandateCondition: 'Titular',
        },
      ]);
      prismaMock.parliamentarian.count.mockResolvedValue(1);

      const result = await service.listParliamentarians({
        nome: 'João',
        partido: 'pt',
        uf: 'sp',
      });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { ballotName: { contains: 'João' } },
              { civilName: { contains: 'João' } },
            ],
            currentParty: 'PT',
            state: 'SP',
          },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.data[0]).toEqual({
        id: 1,
        nomeParlamentar: 'João da Silva',
        siglaPartido: 'PT',
        uf: 'SP',
        urlFoto: 'https://example.com/joao.jpg',
        cargo: 'Deputado(a)',
        condicaoMandato: 'Titular',
      });
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        lastPage: 1,
        limit: 20,
        temProximaPagina: false,
      });
    });

    it('should paginate correctly for page 2', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([]);
      prismaMock.parliamentarian.count.mockResolvedValue(45);

      const result = await service.listParliamentarians({ pagina: 2 });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        lastPage: 3,
        limit: 20,
        temProximaPagina: true,
      });
    });

    /**
     * Sem este filtro o frontend fazia fan-out de ~30 requisicoes para separar
     * deputados de senadores em memoria.
     */
    it('should filter by casa on the server', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([]);
      prismaMock.parliamentarian.count.mockResolvedValue(0);

      await service.listParliamentarians({ casa: 'senado' });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'Senador(a)' } }),
      );
    });

    it('should reject an unknown casa instead of silently ignoring it', async () => {
      await expect(
        service.listParliamentarians({ casa: 'assembleia' }),
      ).rejects.toBeInstanceOf(InvalidParameterError);

      expect(prismaMock.parliamentarian.findMany).not.toHaveBeenCalled();
    });

    it('should return empty data when no records found', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue([]);
      prismaMock.parliamentarian.count.mockResolvedValue(0);

      const result = await service.listParliamentarians({});

      expect(result.data).toEqual([]);
      expect(result.meta.lastPage).toBe(1);
    });
  });

  describe('getParliamentarianById', () => {
    const detalhe = {
      id: 1,
      role: 'Deputado(a)',
      ballotName: 'João da Silva',
      civilName: 'João Carlos da Silva',
      currentParty: 'PT',
      state: 'SP',
      photoUrl: 'https://example.com/joao.jpg',
      birthDate: new Date('1980-05-10T00:00:00Z'),
      email: 'joao@camara.leg.br',
      phone: '(61) 3215-1001',
      officeAddress: 'Anexo IV, Gabinete 101',
      mandateCondition: 'Suplente em exercício',
      socialNetworks: [{ platform: 'Instagram', url: 'https://instagram.com/joao' }],
      partyAffiliations: [
        { party: 'PSB', startDate: new Date('2023-02-01T00:00:00Z'), endDate: new Date('2024-03-17T00:00:00Z') },
        { party: 'PT', startDate: new Date('2024-03-18T00:00:00Z'), endDate: null },
      ],
      mandateTerms: [
        { startDate: new Date('2023-02-01T00:00:00Z'), endDate: null, description: 'Titular' },
      ],
    };

    it('should expose condicaoMandato, party history and mandate terms', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(detalhe);

      const result = await service.getParliamentarianById(1);

      // Antes o frontend exibia 'Em exercício' hardcoded para todo mundo.
      expect(result.condicaoMandato).toBe('Suplente em exercício');
      expect(result.historicoPartidario).toEqual([
        { sigla: 'PSB', inicio: '2023-02-01', fim: '2024-03-17' },
        { sigla: 'PT', inicio: '2024-03-18', fim: null },
      ]);
      expect(result.periodosMandato).toEqual([
        { inicio: '2023-02-01', fim: null, descricao: 'Titular' },
      ]);
      expect(result.dataNascimento).toBe('1980-05-10');
    });

    it('should filter social networks with null platform or url', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        ...detalhe,
        socialNetworks: [
          { platform: 'Instagram', url: 'https://instagram.com/joao' },
          { platform: null, url: 'https://x.com/joao' },
          { platform: 'Facebook', url: null },
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

  describe('listCommitteesByParliamentarianId', () => {
    it('should return committees from membroOrgao, not synthetic data', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.orgaoMembership.findMany.mockResolvedValue([
        {
          role: 'Presidente',
          orgao: {
            idOrgao: 7,
            sigla: 'CCJC',
            nome: 'Comissão de Constituição e Justiça',
            tipoOrgao: 'Comissão Permanente',
            casa: 'Camara',
          },
        },
      ]);
      prismaMock.orgaoMembership.count.mockResolvedValue(1);

      const result = await service.listCommitteesByParliamentarianId(1, {});

      expect(result.data).toEqual([
        {
          id: 7,
          sigla: 'CCJC',
          nome: 'Comissão de Constituição e Justiça',
          tipoOrgao: 'Comissão Permanente',
          casa: 'Camara',
          cargo: 'Presidente',
        },
      ]);
      expect(result.meta.total).toBe(1);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listCommitteesByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listExpensesByParliamentarianId', () => {
    it('should return paginated expenses with meta', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([
        {
          expenseDate: new Date('2024-01-15T00:00:00Z'),
          category: 'Hospedagem',
          supplierName: 'Hotel Brasília',
          amount: 850,
          invoiceUrl: 'https://example.com/nota.pdf',
        },
      ]);
      prismaMock.expense.count.mockResolvedValue(1);

      const result = await service.listExpensesByParliamentarianId(1, {});

      expect(result.data).toEqual([
        {
          data: '2024-01-15',
          tipo: 'Hospedagem',
          fornecedor: 'Hotel Brasília',
          valor: 850,
          urlDocumento: 'https://example.com/nota.pdf',
        },
      ]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        lastPage: 1,
        limit: 20,
        temProximaPagina: false,
      });
    });

    it('should apply year and month filter', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findMany.mockResolvedValue([]);
      prismaMock.expense.count.mockResolvedValue(0);

      await service.listExpensesByParliamentarianId(1, { ano: 2024, mes: 2 });

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

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listExpensesByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getExpenseSummaryByParliamentarianId', () => {
    beforeEach(() => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.expense.findFirst.mockResolvedValue({
        expenseDate: new Date('2024-03-20T00:00:00Z'),
      });
      prismaMock.expense.groupBy.mockResolvedValue([
        { category: 'Hospedagem', _sum: { amount: 850 } },
        { category: null, _sum: { amount: 150 } },
      ]);
      prismaMock.expense.aggregate.mockResolvedValue({
        _sum: { amount: 3000 },
        _max: { amount: 1200 },
      });
    });

    /**
     * O calculo antigo era `totalAno / 12` fixo, o que subestimava qualquer
     * parlamentar com menos de um ano de dados.
     */
    it('should divide by the months with data inside the mandate, not by 12', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ meses: BigInt(3) }]);

      const result = await service.getExpenseSummaryByParliamentarianId(1, {});

      expect(result.totalAno).toBe(3000);
      expect(result.mesesConsiderados).toBe(3);
      expect(result.mediaMensal).toBe(1000);
    });

    it('should return null mediaMensal when there is no month with data', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ meses: BigInt(0) }]);

      const result = await service.getExpenseSummaryByParliamentarianId(1, {});

      // Nunca 0: o front precisa distinguir "sem dados" de "gastou zero".
      expect(result.mediaMensal).toBeNull();
    });

    it('should use "Não informado" when category is null', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ meses: BigInt(1) }]);

      const result = await service.getExpenseSummaryByParliamentarianId(1, {});

      expect(result.categorias).toEqual([
        { tipoDespesa: 'Hospedagem', total: 850 },
        { tipoDespesa: 'Não informado', total: 150 },
      ]);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.getExpenseSummaryByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listAmendmentsByParliamentarianId', () => {
    const link = (overrides: Record<string, unknown> = {}) => ({
      amendmentId: 10,
      linkMethod: 'nome_normalizado',
      confidence: 95,
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
      ...overrides,
    });

    /**
     * O swagger sempre prometeu `{data, meta}`; o service devolvia array puro.
     */
    it('should return a paginated payload with meta', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([link()]);
      prismaMock.amendmentParliamentarian.count.mockResolvedValue(1);

      const result = await service.listAmendmentsByParliamentarianId(1, {});

      expect(prismaMock.amendmentParliamentarian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        lastPage: 1,
        limit: 20,
        temProximaPagina: false,
      });
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: 10,
          codigoEmenda: 'EMD-2024-001',
          valorEmpenhado: 100000,
          metodoVinculo: 'nome_normalizado',
          confiancaVinculo: 95,
        }),
      );
    });

    it('should use 0 for null monetary values and null for missing confidence', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.findMany.mockResolvedValue([
        link({
          confidence: null,
          linkMethod: null,
          amendment: { ...link().amendment, committedAmount: null },
        }),
      ]);
      prismaMock.amendmentParliamentarian.count.mockResolvedValue(1);

      const result = await service.listAmendmentsByParliamentarianId(1, {});

      expect(result.data[0].valorEmpenhado).toBe(0);
      // Confianca ausente nao pode virar 0: 0 significaria "vinculo pessimo".
      expect(result.data[0].confiancaVinculo).toBeNull();
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listAmendmentsByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getAmendmentSummaryByParliamentarianId', () => {
    it('should aggregate in the database instead of reducing in JS', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.count.mockResolvedValue(2);
      prismaMock.amendment.aggregate.mockResolvedValue({
        _sum: { committedAmount: 150000, liquidatedAmount: 120000, paidAmount: 120000 },
      });

      const result = await service.getAmendmentSummaryByParliamentarianId(1);

      expect(prismaMock.amendment.aggregate).toHaveBeenCalledWith({
        where: { parliamentarianLinks: { some: { parliamentarianId: 1 } } },
        _sum: { committedAmount: true, liquidatedAmount: true, paidAmount: true },
      });
      // Nao pode mais puxar a lista inteira de vinculos para a memoria.
      expect(prismaMock.amendmentParliamentarian.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        totalEmendas: 2,
        totalEmpenhado: 150000,
        totalLiquidado: 120000,
        totalPago: 120000,
      });
    });

    it('should return zeros when no amendments found', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentParliamentarian.count.mockResolvedValue(0);
      prismaMock.amendment.aggregate.mockResolvedValue({
        _sum: { committedAmount: null, liquidatedAmount: null, paidAmount: null },
      });

      const result = await service.getAmendmentSummaryByParliamentarianId(1);

      expect(result).toEqual({
        totalEmendas: 0,
        totalEmpenhado: 0,
        totalLiquidado: 0,
        totalPago: 0,
      });
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.getAmendmentSummaryByParliamentarianId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listPropositionsByParliamentarianId', () => {
    it('should expose casa, dataApresentacao and temas', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.propositionAuthor.findMany.mockResolvedValue([
        {
          proposition: {
            id: 5,
            house: 'Camara',
            propositionType: { sigla: 'PL' },
            number: '1234',
            year: 2024,
            summary: 'Ementa',
            currentStatus: 'Em tramitação',
            presentationDate: new Date('2024-02-01T10:00:00Z'),
            temaProposicao: [{ tema: { descricao: 'Administração Pública' } }],
          },
        },
      ]);
      prismaMock.propositionAuthor.count.mockResolvedValue(1);

      const result = await service.listPropositionsByParliamentarianId(1, {});

      expect(result.data[0]).toEqual({
        id: 5,
        casa: 'Camara',
        sigla: 'PL',
        numero: '1234',
        ano: 2024,
        ementa: 'Ementa',
        situacao: 'Em tramitação',
        dataApresentacao: '2024-02-01',
        temas: ['Administração Pública'],
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
      expect(result.meta.lastPage).toBe(2);
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listPropositionsByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listVotingsByParliamentarianId', () => {
    const voteRow = (overrides: Record<string, unknown> = {}) => ({
      choice: 'SIM',
      voting: {
        id: 3,
        casa: 'Camara',
        votingDate: new Date('2024-03-15T18:00:00Z'),
        subjectSummary: 'Resumo',
        finalResult: 'Aprovado',
        votingType: 'NOMINAL',
        proposition: {
          id: 5,
          propositionType: { sigla: 'PL' },
          number: '1234',
          year: 2024,
          summary: 'Ementa',
          currentStatus: 'Em tramitação',
        },
        ...(overrides.voting as object),
      },
      ...overrides,
    });

    it('should return paginated votings for parliamentarian', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([voteRow()]);
      prismaMock.vote.count.mockResolvedValue(1);

      const result = await service.listVotingsByParliamentarianId(1, {});

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: 3,
          casa: 'Camara',
          data: '2024-03-15',
          titulo: 'PL 1234/2024',
          voto: 'SIM',
        }),
      );
      expect(result.meta.total).toBe(1);
    });

    it('should return null data when votingDate is null', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.vote.findMany.mockResolvedValue([
        voteRow({ voting: { votingDate: null, proposition: null } }),
      ]);
      prismaMock.vote.count.mockResolvedValue(1);

      const result = await service.listVotingsByParliamentarianId(1, {});

      expect(result.data[0].data).toBeNull();
      expect(result.data[0].proposicao).toBeNull();
      expect(result.data[0].titulo).toBe('Deliberação registrada');
    });

    it('should throw NotFoundError when parliamentarian does not exist', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue(null);

      await expect(
        service.listVotingsByParliamentarianId(999, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getPresenceByParliamentarianId', () => {
    const evento = (
      descricaoTipo: string | null,
      tipoOrgao: string | null,
      dataHoraInicio = new Date('2024-03-15T14:00:00Z'),
      house = 'Camara',
    ) => ({
      dataHoraInicio,
      house,
      descricaoTipo,
      orgao: tipoOrgao === null ? null : { tipoOrgao, sigla: null },
    });

    beforeEach(() => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.mandateTerm.findMany.mockResolvedValue([
        { startDate: new Date('2023-02-01T00:00:00Z'), endDate: null, description: 'Titular' },
      ]);
    });

    /**
     * O ramo antigo sintetizava presenca do Senado a partir de votos agrupados
     * por dia. Com o agregador gravando presenca real, manter os dois lados
     * causava contagem dupla — a leitura de `voto` tem de ter desaparecido.
     */
    it('should not read votes at all', async () => {
      prismaMock.presence.findMany.mockResolvedValue([]);

      await service.getPresenceByParliamentarianId(1);

      expect(prismaMock.vote.findMany).not.toHaveBeenCalled();
    });

    it('should keep plenary and committee rates separate', async () => {
      prismaMock.presence.findMany.mockResolvedValue([
        { status: 'PRESENTE', event: evento('Sessão Deliberativa', 'Plenário') },
        { status: 'PRESENTE', event: evento('Sessão Deliberativa', 'Plenário') },
        { status: 'AUSENTE', event: evento('Reunião Deliberativa', 'Comissão Permanente') },
      ]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(presenca.plenario.deliberativas.taxa).toBe(100);
      expect(presenca.comissoes.deliberativas.taxa).toBe(0);
      expect(presenca.plenario.deliberativas.taxa).not.toBe(
        presenca.comissoes.deliberativas.taxa,
      );
    });

    /**
     * `includes('deliberativa')` classificava "Sessão NAO Deliberativa Solene"
     * como deliberativa.
     */
    it('should keep a solemn non-deliberative session out of the deliberative bucket', async () => {
      prismaMock.presence.findMany.mockResolvedValue([
        { status: 'AUSENTE', event: evento('Sessão Não Deliberativa Solene', 'Plenário') },
      ]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(presenca.plenario.deliberativas.total).toBe(0);
      expect(presenca.plenario.deliberativas.taxa).toBeNull();
      expect(presenca.plenario.naoDeliberativas.total).toBe(1);
      expect(presenca.plenario.naoDeliberativas.faltas).toBe(1);
    });

    it('should exclude events with unknown or missing classification', async () => {
      prismaMock.presence.findMany.mockResolvedValue([
        { status: 'AUSENTE', event: evento(null, 'Plenário') },
        { status: 'AUSENTE', event: evento('Sessão Deliberativa', null) },
      ]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(presenca.excluidos).toEqual({
        eventosSemClassificacao: 1,
        eventosSemOrgao: 1,
      });
      expect(presenca.plenario.deliberativas.total).toBe(0);
    });

    /**
     * Aceite do plano: senador empossado em 2025 nao pode acumular faltas de
     * sessoes anteriores a posse. O recorte e feito no proprio `where`.
     */
    it('should restrict the denominator to the mandate windows', async () => {
      prismaMock.mandateTerm.findMany.mockResolvedValue([
        { startDate: new Date('2025-02-01T00:00:00Z'), endDate: null, description: 'Suplente em exercício' },
      ]);
      prismaMock.presence.findMany.mockResolvedValue([]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(prismaMock.presence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            parliamentarianId: 1,
            OR: [
              {
                event: {
                  dataHoraInicio: { gte: new Date('2025-02-01T00:00:00Z') },
                },
              },
            ],
          },
        }),
      );
      expect(presenca.janela.restritaAoExercicio).toBe(true);
    });

    /**
     * Sem dados de mandato a taxa NAO e zerada: seria pior do que uma taxa com
     * denominador amplo e rotulada como tal.
     */
    it('should not filter (and should flag it) when there are no mandate terms', async () => {
      prismaMock.mandateTerm.findMany.mockResolvedValue([]);
      prismaMock.presence.findMany.mockResolvedValue([
        { status: 'PRESENTE', event: evento('Sessão Deliberativa', 'Plenário') },
      ]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(prismaMock.presence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { parliamentarianId: 1 } }),
      );
      expect(presenca.janela.restritaAoExercicio).toBe(false);
      expect(presenca.plenario.deliberativas.taxa).toBe(100);
    });

    it('should expose both a lenient and a strict rate', async () => {
      prismaMock.presence.findMany.mockResolvedValue([
        { status: 'PRESENTE', event: evento('Sessão Deliberativa', 'Plenário') },
        { status: 'JUSTIFICADA', event: evento('Sessão Deliberativa', 'Plenário') },
      ]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(presenca.plenario.deliberativas.taxa).toBe(100);
      expect(presenca.plenario.deliberativas.taxaEstrita).toBe(50);
    });

    it('should label the methodology per house', async () => {
      prismaMock.presence.findMany.mockResolvedValue([
        {
          status: 'PRESENTE',
          event: evento('Sessão Deliberativa', 'Plenário', new Date('2025-03-11T16:00:00Z'), 'Senado'),
        },
      ]);

      const { presenca } = await service.getPresenceByParliamentarianId(1);

      expect(presenca.metodologia).toEqual([
        expect.objectContaining({ casa: 'Senado' }),
      ]);
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
        role: 'Deputado(a)',
        ballotName: 'João da Silva',
        civilName: 'João Carlos da Silva',
        currentParty: 'PT',
        state: 'SP',
        photoUrl: null,
        birthDate: null,
        email: null,
        phone: null,
        officeAddress: null,
        mandateCondition: 'Titular',
        socialNetworks: [],
        partyAffiliations: [],
        mandateTerms: [],
      });
      prismaMock.mandateTerm.findMany.mockResolvedValue([]);
      prismaMock.presence.findMany.mockResolvedValue([]);
      prismaMock.partyAffiliation.count.mockResolvedValue(1);
      prismaMock.vote.findMany.mockResolvedValue([]);
      prismaMock.vote.count.mockResolvedValue(0);
      prismaMock.propositionAuthor.findMany.mockResolvedValue([]);
      prismaMock.propositionAuthor.count.mockResolvedValue(7);
      prismaMock.orgaoMembership.findMany.mockResolvedValue([]);
      prismaMock.orgaoMembership.count.mockResolvedValue(0);
      prismaMock.expense.findFirst.mockResolvedValue(null);
      prismaMock.expense.groupBy.mockResolvedValue([]);
      prismaMock.expense.aggregate.mockResolvedValue({
        _sum: { amount: null },
        _max: { amount: null },
      });
      prismaMock.amendmentParliamentarian.count.mockResolvedValue(0);
      prismaMock.amendment.aggregate.mockResolvedValue({
        _sum: { committedAmount: null, liquidatedAmount: null, paidAmount: null },
      });
      prismaMock.$queryRaw.mockResolvedValue([]);
    });

    it('should return every section with a real alignment block', async () => {
      const result = await service.getAggregatedProfile(1);

      expect(Object.keys(result)).toEqual([
        'visaoGeral',
        'comissoes',
        'votacoes',
        'proposicoes',
        'despesas',
        'emendas',
      ]);
      // Antes era `alinhamento: null` hardcoded.
      expect(result.votacoes.alinhamento).toEqual(
        expect.objectContaining({ disponivel: true }),
      );
      expect(result.proposicoes.total).toBe(7);
    });

    /**
     * `aprovadas` era `0` hardcoded e o banco nao tem campo estruturado de
     * aprovacao — melhor ausente do que sempre errado.
     */
    it('should not expose an "aprovadas" count', async () => {
      const result = await service.getAggregatedProfile(1);

      expect(result.proposicoes).not.toHaveProperty('aprovadas');
    });

    it('should report alignment as unavailable for senators', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({
        id: 2,
        role: 'Senador(a)',
        ballotName: 'Antônio Nunes',
        civilName: 'Antônio Ribeiro Nunes',
        currentParty: 'MDB',
        state: 'BA',
        photoUrl: null,
        birthDate: null,
        email: null,
        phone: null,
        officeAddress: null,
        mandateCondition: 'Titular',
        socialNetworks: [],
        partyAffiliations: [],
        mandateTerms: [],
      });

      const result = await service.getAggregatedProfile(2);

      // O agregador so grava orientacao de bancada da Camara. Indisponivel com
      // motivo explicito, nunca 0%.
      expect(result.votacoes.alinhamento).toEqual({
        disponivel: false,
        motivo: 'ORIENTACAO_INDISPONIVEL_SENADO',
        taxa: null,
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
