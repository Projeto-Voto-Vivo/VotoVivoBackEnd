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
