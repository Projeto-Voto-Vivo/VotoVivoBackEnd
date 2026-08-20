import { PropositionService } from './proposition.service';
import { InvalidParameterError, NotFoundError } from '../errors/http-errors';

describe('PropositionService', () => {
  let prismaMock: any;
  let service: PropositionService;

  beforeEach(() => {
    prismaMock = {
      proposition: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      tramitacao: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      orgao: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      tipoTramitacao: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      vote: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      propositionType: {
        findMany: jest.fn(),
      },
      tema: {
        findMany: jest.fn(),
      },
    };

    service = new PropositionService(prismaMock);
  });

  describe('listPropositions', () => {
    beforeEach(() => {
      prismaMock.proposition.findMany.mockResolvedValue([]);
      prismaMock.proposition.count.mockResolvedValue(0);
    });

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
      const result = await service.listPropositions();

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.data).toEqual([]);
    });

    it('should send an empty where when no filter is given', async () => {
      await service.listPropositions();

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    /**
     * A sigla se repete entre as casas (`PL` existe nas duas), por isso o
     * filtro é pela relação e não por uma coluna de `proposicao`.
     */
    it('should filter by tipo through the propositionType relation', async () => {
      await service.listPropositions(undefined, { tipo: 'pl' });

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { propositionType: { sigla: 'PL' } } }),
      );
    });

    it('should filter by ano and casa', async () => {
      await service.listPropositions(undefined, { ano: 2024, casa: 'senado' });

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { year: 2024, house: 'Senado' } }),
      );
    });

    /** `statusAtual` é texto livre: match exato não casaria quase nada. */
    it('should match situacao by substring', async () => {
      await service.listPropositions(undefined, { situacao: 'tramitação' });

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { currentStatus: { contains: 'tramitação' } },
        }),
      );
    });

    /**
     * A mesma descrição existe nas duas casas com ids diferentes (`tema` é
     * único por codigoExterno + casa + nivel); filtrar pela descrição pega as
     * duas, que é o que o usuário espera ao escolher "Saúde" num dropdown.
     */
    it('should filter by tema through the join table', async () => {
      await service.listPropositions(undefined, { tema: 'Saúde' });

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { temaProposicao: { some: { tema: { descricao: 'Saúde' } } } },
        }),
      );
    });

    /**
     * Busca no servidor: com o universo completo, o cliente só teria a página
     * corrente em mãos e o termo quase sempre casaria numa página não baixada.
     */
    it('should search ementa and numero', async () => {
      await service.listPropositions(undefined, { busca: 'transparência' });

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { summary: { contains: 'transparência' } },
              { number: { contains: 'transparência' } },
            ],
          },
        }),
      );
    });

    it('should combine every filter in a single where', async () => {
      await service.listPropositions(undefined, {
        tipo: 'PEC',
        ano: 2023,
        casa: 'camara',
        situacao: 'Aguardando',
        tema: 'Saúde',
        busca: 'creche',
      });

      expect(prismaMock.proposition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            propositionType: { sigla: 'PEC' },
            year: 2023,
            house: 'Camara',
            currentStatus: { contains: 'Aguardando' },
            temaProposicao: { some: { tema: { descricao: 'Saúde' } } },
            OR: [
              { summary: { contains: 'creche' } },
              { number: { contains: 'creche' } },
            ],
          },
        }),
      );
    });

    /**
     * Sem isto o cliente pagina sobre um total que não corresponde ao filtro e
     * volta a precisar baixar tudo para saber quantas páginas existem.
     */
    it('should count with the same where as the query', async () => {
      await service.listPropositions(undefined, { ano: 2024 });

      expect(prismaMock.proposition.count).toHaveBeenCalledWith({
        where: { year: 2024 },
      });
    });

    it('should echo the applied filters back', async () => {
      const result = await service.listPropositions(undefined, { tipo: 'PL' });

      expect(result.filtros).toEqual({
        tipo: 'PL',
        ano: null,
        casa: null,
        situacao: null,
        tema: null,
        busca: null,
        autor: null,
      });
    });

    it('should reject an unknown casa', async () => {
      await expect(
        service.listPropositions(undefined, { casa: 'assembleia' }),
      ).rejects.toBeInstanceOf(InvalidParameterError);

      expect(prismaMock.proposition.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listFilterOptions', () => {
    it('should return the domains the UI needs to build its dropdowns', async () => {
      prismaMock.propositionType.findMany.mockResolvedValue([
        { sigla: 'PL', nome: 'Projeto de Lei', casa: 'Camara' },
      ]);
      prismaMock.proposition.groupBy
        .mockResolvedValueOnce([{ year: 2024, _count: { _all: 12 } }])
        .mockResolvedValueOnce([
          { currentStatus: 'Em tramitação', _count: { _all: 9 } },
          { currentStatus: 'Aguardando parecer', _count: { _all: 3 } },
        ])
        .mockResolvedValueOnce([{ house: 'Camara', _count: { _all: 12 } }]);
      prismaMock.tema.findMany.mockResolvedValue([
        {
          idTema: 3,
          descricao: 'Administração Pública',
          casa: 'Camara',
          _count: { temaProposicao: 4 },
        },
        {
          idTema: 9,
          descricao: 'Tema sem uso',
          casa: 'Senado',
          _count: { temaProposicao: 0 },
        },
      ]);

      const result = await service.listFilterOptions();

      expect(result.tipos).toEqual([
        { sigla: 'PL', nome: 'Projeto de Lei', casa: 'Camara' },
      ]);
      expect(result.anos).toEqual([{ ano: 2024, total: 12 }]);
      // Ordenado por contagem: a UI mostra o que é relevante primeiro.
      expect(result.situacoes).toEqual([
        { situacao: 'Em tramitação', total: 9 },
        { situacao: 'Aguardando parecer', total: 3 },
      ]);
      expect(result.casas).toEqual([{ casa: 'Camara', total: 12 }]);
      // Tema sem proposição viraria uma opção morta no dropdown.
      expect(result.temas).toEqual([
        { id: 3, tema: 'Administração Pública', casa: 'Camara', total: 4 },
      ]);
    });

    it('should cap the free-text situacao list', async () => {
      prismaMock.propositionType.findMany.mockResolvedValue([]);
      prismaMock.proposition.groupBy.mockResolvedValue([]);
      prismaMock.tema.findMany.mockResolvedValue([]);

      const result = await service.listFilterOptions();

      expect(prismaMock.proposition.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['currentStatus'], take: 100 }),
      );
      expect(result.metadata.situacoesTruncadasEm).toBe(100);
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
        apiId: '2001',
        temaProposicao: [],
        votings: [],
        authors: [],
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

  describe('getPropositionById — autoria, apiId e placar', () => {
    const detalhe = (overrides = {}) => ({
      id: 1,
      apiId: '2001',
      house: 'Camara',
      propositionType: { sigla: 'PL' },
      number: '123',
      year: 2024,
      summary: 'Ementa',
      currentStatus: 'Em tramitação',
      presentationDate: null,
      temaProposicao: [],
      votings: [],
      authors: [],
      relations: [],
      ...overrides,
    });

    /** Sem `apiId` o cliente nao consegue montar o link para a ficha oficial. */
    it('should expose the source apiId', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(detalhe());

      const result = await service.getPropositionById(1);

      expect(result.apiId).toBe('2001');
    });

    it('should expose parliamentary authors', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(
        detalhe({
          authors: [
            {
              parliamentarian: {
                id: 7,
                ballotName: 'João da Silva',
                currentParty: 'PT',
                state: 'SP',
                photoUrl: 'https://example.com/joao.jpg',
                role: 'Deputado(a)',
              },
            },
          ],
        }),
      );

      const result = await service.getPropositionById(1);

      expect(result.autores).toEqual([
        {
          id: 7,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          urlFoto: 'https://example.com/joao.jpg',
          cargo: 'Deputado(a)',
        },
      ]);
    });

    /**
     * `autoriaProposicao` so liga proposicao a parlamentar: projeto do
     * Executivo fica sem autor nenhum. A lista vazia precisa vir acompanhada da
     * ressalva, senao a UI mostra "sem autor" para um projeto que tem autor.
     */
    it('should flag that only parliamentary authorship is modelled', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(detalhe());

      const result = await service.getPropositionById(1);

      expect(result.autores).toEqual([]);
      expect(result.autoria.somenteParlamentares).toBe(true);
      expect(result.autoria.observacao).toMatch(/Executivo/);
    });

    /**
     * Um unico groupBy para todas as votacoes, em vez de uma consulta por
     * votacao.
     */
    it('should attach an aggregated tally and orgao to each voting', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(
        detalhe({
          votings: [
            {
              id: 5,
              casa: 'Camara',
              votingDate: null,
              subjectSummary: null,
              finalResult: 'Aprovado',
              votingType: 'NOMINAL',
              orgao: {
                idOrgao: 4,
                sigla: 'CCJC',
                nome: 'Comissão de Constituição e Justiça',
                tipoOrgao: 'Comissão Permanente',
                casa: 'Camara',
              },
            },
          ],
        }),
      );
      prismaMock.vote.groupBy.mockResolvedValue([
        { votingId: 5, choice: 'SIM', _count: { _all: 300 } },
        { votingId: 5, choice: 'NAO', _count: { _all: 100 } },
      ]);

      const result = await service.getPropositionById(1);

      expect(prismaMock.vote.groupBy).toHaveBeenCalledTimes(1);
      expect(result.votacoes[0].placar.SIM).toBe(300);
      expect(result.votacoes[0].placar.ABSTENCAO).toBe(0);
      expect(result.votacoes[0].totalVotos).toBe(400);
      expect(result.votacoes[0].orgao?.sigla).toBe('CCJC');
    });

    it('should not query votes when there is no voting', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(detalhe());

      await service.getPropositionById(1);

      expect(prismaMock.vote.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('listTramitacoes', () => {
    beforeEach(() => {
      prismaMock.proposition.findUnique.mockResolvedValue({ id: 1 });
    });

    const etapa = (overrides = {}) => ({
      idTramitacao: 10,
      sequencia: 1,
      dataHora: new Date('2024-02-01T10:00:00Z'),
      descricaoTramitacao: 'Apresentação',
      descricaoSituacao: 'Aguardando despacho',
      despacho: 'Às comissões',
      idOrgao: 4,
      idTipoTramitacao: 2,
      ...overrides,
    });

    it('should order by sequencia and fall back to dataHora', async () => {
      await service.listTramitacoes(1);

      expect(prismaMock.tramitacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ sequencia: 'asc' }, { dataHora: 'asc' }],
          skip: 0,
          take: 20,
        }),
      );
    });

    /**
     * `tramitacao.idOrgao` e `idTipoTramitacao` sao colunas soltas, sem FK no
     * schema canonico — declarar @relation faria o schema:check acusar
     * divergencia. O join acontece aqui, em consultas separadas e limitadas aos
     * ids da pagina.
     */
    it('should stitch orgao and regime without a Prisma relation', async () => {
      prismaMock.tramitacao.findMany.mockResolvedValue([etapa()]);
      prismaMock.tramitacao.count.mockResolvedValue(1);
      prismaMock.orgao.findMany.mockResolvedValue([
        {
          idOrgao: 4,
          sigla: 'CCTCI',
          nome: 'Comissão de Comunicação',
          tipoOrgao: 'Comissão Permanente',
          casa: 'Camara',
        },
      ]);
      prismaMock.tipoTramitacao.findMany.mockResolvedValue([
        { idTipoTramitacao: 2, descricao: 'Recebimento', regime: 'Prioridade' },
      ]);

      const result = await service.listTramitacoes(1);

      expect(prismaMock.orgao.findMany).toHaveBeenCalledWith({
        where: { idOrgao: { in: [4] } },
      });
      expect(result.data[0]).toEqual({
        id: 10,
        sequencia: 1,
        dataHora: new Date('2024-02-01T10:00:00Z'),
        descricaoTramitacao: 'Apresentação',
        descricaoSituacao: 'Aguardando despacho',
        despacho: 'Às comissões',
        regime: 'Prioridade',
        tipoTramitacao: 'Recebimento',
        orgao: {
          id: 4,
          sigla: 'CCTCI',
          nome: 'Comissão de Comunicação',
          tipoOrgao: 'Comissão Permanente',
          casa: 'Camara',
        },
      });
    });

    it('should return null orgao and regime when the columns are null', async () => {
      prismaMock.tramitacao.findMany.mockResolvedValue([
        etapa({ idOrgao: null, idTipoTramitacao: null }),
      ]);
      prismaMock.tramitacao.count.mockResolvedValue(1);

      const result = await service.listTramitacoes(1);

      expect(result.data[0].orgao).toBeNull();
      expect(result.data[0].regime).toBeNull();
      // Nada a resolver: nao vale gastar consulta.
      expect(prismaMock.orgao.findMany).not.toHaveBeenCalled();
      expect(prismaMock.tipoTramitacao.findMany).not.toHaveBeenCalled();
    });

    it('should deduplicate the ids it resolves', async () => {
      prismaMock.tramitacao.findMany.mockResolvedValue([
        etapa({ idTramitacao: 10 }),
        etapa({ idTramitacao: 11 }),
      ]);
      prismaMock.tramitacao.count.mockResolvedValue(2);

      await service.listTramitacoes(1);

      expect(prismaMock.orgao.findMany).toHaveBeenCalledWith({
        where: { idOrgao: { in: [4] } },
      });
    });

    it('should paginate', async () => {
      prismaMock.tramitacao.count.mockResolvedValue(45);

      const result = await service.listTramitacoes(1, { page: 2, limit: 20 });

      expect(prismaMock.tramitacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.meta).toEqual({ total: 45, page: 2, lastPage: 3, limit: 20 });
    });

    it('should throw NotFoundError when the proposition does not exist', async () => {
      prismaMock.proposition.findUnique.mockResolvedValue(null);

      await expect(service.listTramitacoes(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(prismaMock.tramitacao.findMany).not.toHaveBeenCalled();
    });
  });
});
