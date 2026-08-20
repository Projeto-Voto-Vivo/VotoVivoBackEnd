import { ThemeProfileService } from './theme-profile.service';

describe('ThemeProfileService', () => {
  let prismaMock: any;
  let service: ThemeProfileService;

  /**
   * A ordem das queries em `getThemeProfile` é: autoria, votos e depois os
   * cinco contadores de `totais`.
   */
  const mockQueries = (overrides: Partial<{
    autoria: unknown[];
    votos: unknown[];
    proposicoes: number;
    proposicoesSemTema: number;
    votosTotal: number;
    votosSemProposicao: number;
    votosEmProposicaoSemTema: number;
  }> = {}) => {
    const {
      autoria = [],
      votos = [],
      proposicoes = 0,
      proposicoesSemTema = 0,
      votosTotal = 0,
      votosSemProposicao = 0,
      votosEmProposicaoSemTema = 0,
    } = overrides;

    prismaMock.$queryRaw
      .mockResolvedValueOnce(autoria)
      .mockResolvedValueOnce(votos)
      .mockResolvedValueOnce([{ total: BigInt(proposicoes) }])
      .mockResolvedValueOnce([{ total: BigInt(proposicoesSemTema) }])
      .mockResolvedValueOnce([{ total: BigInt(votosTotal) }])
      .mockResolvedValueOnce([{ total: BigInt(votosSemProposicao) }])
      .mockResolvedValueOnce([{ total: BigInt(votosEmProposicaoSemTema) }]);
  };

  beforeEach(() => {
    prismaMock = { $queryRaw: jest.fn() };
    service = new ThemeProfileService(prismaMock);
  });

  it('should rank the themes the parliamentarian authors most', async () => {
    mockQueries({
      autoria: [
        { tema: 'Saúde', total: BigInt(7) },
        { tema: 'Educação', total: BigInt(3) },
      ],
      proposicoes: 8,
    });

    const result = await service.getThemeProfile(1);

    expect(result.proposicoes.temas).toEqual([
      { tema: 'Saúde', total: 7 },
      { tema: 'Educação', total: 3 },
    ]);
    expect(result.proposicoes.totalProposicoes).toBe(8);
  });

  /**
   * Uma proposição com N temas conta em cada um deles. Sem `totalProposicoes`
   * ao lado, a UI somaria a lista e mostraria um número que não bate com nada.
   */
  it('should expose a total smaller than the sum per theme', async () => {
    mockQueries({
      autoria: [
        { tema: 'Saúde', total: BigInt(5) },
        { tema: 'Educação', total: BigInt(4) },
      ],
      proposicoes: 6,
    });

    const result = await service.getThemeProfile(1);

    const soma = result.proposicoes.temas.reduce((acc, t) => acc + t.total, 0);
    expect(soma).toBe(9);
    expect(result.proposicoes.totalProposicoes).toBe(6);
    expect(result.metadata.observacao).toMatch(/conta em cada um/);
  });

  it('should split SIM and NAO per theme and compute the balance', async () => {
    mockQueries({
      votos: [
        {
          tema: 'Saúde',
          sim: '9',
          nao: '2',
          abstencao: '1',
          obstrucao: '3',
          total: BigInt(15),
        },
      ],
      votosTotal: 15,
    });

    const result = await service.getThemeProfile(1);

    expect(result.votacoes.temas[0]).toEqual({
      tema: 'Saúde',
      votosSim: 9,
      votosNao: 2,
      saldo: 7,
      abstencoes: 1,
      obstrucoes: 3,
      totalVotos: 15,
    });
  });

  it('should produce a negative balance when NAO wins', async () => {
    mockQueries({
      votos: [
        { tema: 'Tributação', sim: '1', nao: '6', abstencao: '0', obstrucao: '0', total: BigInt(7) },
      ],
    });

    const result = await service.getThemeProfile(1);

    expect(result.votacoes.temas[0].saldo).toBe(-5);
  });

  /**
   * `SUM(cond)` volta como string e `COUNT(*)` como BigInt no driver MariaDB.
   * `JSON.stringify(BigInt)` lança TypeError — a conversão é obrigatória.
   */
  it('should convert driver BigInt/string columns to numbers', async () => {
    mockQueries({
      autoria: [{ tema: 'Saúde', total: BigInt(2) }],
      votos: [
        { tema: 'Saúde', sim: '3', nao: null, abstencao: null, obstrucao: null, total: BigInt(3) },
      ],
      proposicoes: 2,
      votosTotal: 3,
    });

    const result = await service.getThemeProfile(1);

    expect(typeof result.proposicoes.temas[0].total).toBe('number');
    expect(result.votacoes.temas[0].votosNao).toBe(0);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  /**
   * Votos em requerimentos (sem proposição) e em proposições sem tema não
   * podem sumir em silêncio: o que não classifica vira viés invisível.
   */
  it('should report what could not be classified instead of dropping it', async () => {
    mockQueries({
      votos: [
        { tema: 'Saúde', sim: '4', nao: '0', abstencao: '0', obstrucao: '0', total: BigInt(4) },
      ],
      votosTotal: 11,
      votosSemProposicao: 5,
      votosEmProposicaoSemTema: 2,
      proposicoes: 3,
      proposicoesSemTema: 1,
    });

    const result = await service.getThemeProfile(1);

    expect(result.votacoes.totalVotos).toBe(11);
    expect(result.votacoes.excluidos).toEqual({
      votosSemProposicao: 5,
      votosEmProposicaoSemTema: 2,
    });
    expect(result.proposicoes.semTema).toBe(1);
  });

  /**
   * A votação pode ser sobre destaque, urgência ou texto principal, e o objeto
   * não é distinguível no dado — a UI não pode ler SIM como apoio ao tema sem
   * a ressalva.
   */
  it('should warn that SIM/NAO is not a position on the theme', async () => {
    mockQueries();

    const result = await service.getThemeProfile(1);

    expect(result.metadata.observacao).toMatch(/nao posicao sobre o tema|não posição sobre o tema/i);
    expect(result.metadata.exclusoes.length).toBeGreaterThan(0);
  });

  it('should return empty blocks when there is nothing to show', async () => {
    mockQueries();

    const result = await service.getThemeProfile(1);

    expect(result.proposicoes.temas).toEqual([]);
    expect(result.votacoes.temas).toEqual([]);
    expect(result.proposicoes.totalProposicoes).toBe(0);
  });

  it('should default the limit and accept an override', async () => {
    mockQueries();
    const padrao = await service.getThemeProfile(1);
    expect(padrao.metadata.limite).toBe(10);

    prismaMock.$queryRaw.mockReset();
    mockQueries();
    const custom = await service.getThemeProfile(1, 25);
    expect(custom.metadata.limite).toBe(25);
  });
});
