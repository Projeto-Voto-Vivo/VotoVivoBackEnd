import { AlignmentService, MINIMO_PARA_TAXA } from './alignment.service';

describe('AlignmentService', () => {
  let prismaMock: any;
  let service: AlignmentService;

  beforeEach(() => {
    prismaMock = {
      parliamentarian: { findUnique: jest.fn() },
      partyAffiliation: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };

    service = new AlignmentService(prismaMock);
  });

  const deputado = () => {
    prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Deputado(a)' });
    prismaMock.partyAffiliation.count.mockResolvedValue(2);
  };

  /** Gera N comparações repartidas entre seguir e divergir. */
  const comparacoes = (seguiu: number, divergiu: number) => [
    { orientacao: 'Sim', voto: 'SIM', total: BigInt(seguiu) },
    { orientacao: 'Sim', voto: 'NAO', total: BigInt(divergiu) },
  ];

  /**
   * O serviço faz duas consultas em paralelo: a agregação orientação × voto e a
   * contagem de votações cuja bancada não foi identificada.
   */
  const responder = (linhas: unknown[], naoResolvidas = 0) => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(linhas)
      .mockResolvedValueOnce([{ total: BigInt(naoResolvidas) }]);
  };

  describe('amostra mínima', () => {
    /**
     * O caso que estava no ar: 100% de fidelidade partidária calculado sobre
     * duas comparações. É a leitura mais forte possível de um número que não
     * sustenta nada.
     */
    it('should not publish a rate built on too few comparisons', async () => {
      deputado();
      responder(comparacoes(2, 0));

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.taxa).toBeNull();
      expect(result.motivo).toBe('AMOSTRA_INSUFICIENTE');
    });

    /** Os contadores continuam, para a UI dizer "2 votações comparadas". */
    it('should keep the counters visible when it withholds the rate', async () => {
      deputado();
      responder(comparacoes(2, 0));

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result).toMatchObject({
        disponivel: true,
        seguiu: 2,
        divergiu: 0,
        consideradas: 2,
        minimoParaTaxa: MINIMO_PARA_TAXA,
      });
    });

    it('should publish the rate once the sample reaches the floor', async () => {
      deputado();
      prismaMock.$queryRaw.mockResolvedValue(
        comparacoes(MINIMO_PARA_TAXA - 5, 5),
      );

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.consideradas).toBe(MINIMO_PARA_TAXA);
      expect(result.taxa).toBe(75);
      expect(result.motivo).toBeNull();
    });

    it('should withhold the rate one comparison below the floor', async () => {
      deputado();
      prismaMock.$queryRaw.mockResolvedValue(
        comparacoes(MINIMO_PARA_TAXA - 1, 0),
      );

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.consideradas).toBe(MINIMO_PARA_TAXA - 1);
      expect(result.taxa).toBeNull();
    });

    /**
     * Zero é qualitativamente diferente de "poucas": significa que não há
     * nenhuma votação com orientação correspondente, não que a amostra é curta.
     */
    it('should distinguish "nothing to compare" from "too few"', async () => {
      deputado();
      responder([]);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.consideradas).toBe(0);
      expect(result.motivo).toBe('SEM_VOTOS_COMPARAVEIS');
      expect(result.taxa).toBeNull();
    });
  });

  describe('regras de comparação', () => {
    it('should compute the rate from the aggregated orientation/vote pairs', async () => {
      deputado();
      responder(comparacoes(24, 6));

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result).toMatchObject({
        disponivel: true,
        taxa: 80,
        seguiu: 24,
        divergiu: 6,
        consideradas: 30,
        liberadas: 0,
        fonteFiliacao: 'historico',
      });
    });

    /**
     * "Liberado" e "Artigo 17" não são orientação: a bancada liberou o voto.
     * Contá-los como divergência inventaria infidelidade partidária.
     */
    it('should keep released votes out of the denominator', async () => {
      deputado();
      responder([
        { orientacao: 'Sim', voto: 'SIM', total: BigInt(25) },
        { orientacao: 'Liberado', voto: 'NAO', total: BigInt(5) },
        { orientacao: 'Artigo 17', voto: 'NAO', total: BigInt(2) },
      ]);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result).toMatchObject({
        taxa: 100,
        consideradas: 25,
        liberadas: 7,
        divergiu: 0,
      });
    });

    it('should compare accent-insensitively', async () => {
      deputado();
      responder([
        { orientacao: 'Não', voto: 'NAO', total: BigInt(20) },
        { orientacao: 'Abstenção', voto: 'ABSTENCAO', total: BigInt(5) },
      ]);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result).toMatchObject({ seguiu: 25, divergiu: 0, taxa: 100 });
    });

    it('should not invent divergence for an unknown orientation', async () => {
      deputado();
      responder([
        { orientacao: 'Questão de Ordem', voto: 'SIM', total: BigInt(30) },
      ]);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result).toMatchObject({
        liberadas: 30,
        consideradas: 0,
        taxa: null,
        motivo: 'SEM_VOTOS_COMPARAVEIS',
      });
    });

    it('should fall back to partidoAtual and flag it when there is no affiliation history', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Deputado(a)' });
      prismaMock.partyAffiliation.count.mockResolvedValue(0);
      responder(comparacoes(20, 0));

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.fonteFiliacao).toBe('partidoAtual');
    });
  });

  describe('Senado', () => {
    /**
     * O agregador só grava orientação de bancada da Câmara. Devolver 0% para
     * senadores seria afirmar infidelidade que não foi medida.
     */
    it('should report unavailable instead of 0%', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Senador(a)' });
      prismaMock.partyAffiliation.count.mockResolvedValue(1);

      const result = await service.getAlignmentByParliamentarianId(2);

      expect(result).toEqual({
        disponivel: false,
        taxa: null,
        motivo: 'ORIENTACAO_INDISPONIVEL_SENADO',
        seguiu: 0,
        divergiu: 0,
        consideradas: 0,
        liberadas: 0,
        bancadaNaoResolvida: 0,
        minimoParaTaxa: MINIMO_PARA_TAXA,
        fonteFiliacao: null,
      });
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    /** Formato uniforme: o cliente lê os mesmos campos nos três casos. */
    it('should return the same shape as the Camara branch', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Senador(a)' });
      prismaMock.partyAffiliation.count.mockResolvedValue(0);
      const senador = await service.getAlignmentByParliamentarianId(2);

      deputado();
      responder(comparacoes(20, 0));
      const deputadoResultado = await service.getAlignmentByParliamentarianId(1);

      expect(Object.keys(senador).sort()).toEqual(
        Object.keys(deputadoResultado).sort(),
      );
    });
  });

  describe('resolução da bancada', () => {
    /**
     * A resolução vem pronta do ETL: `orientacaoVotacao.siglaPartido` para
     * bancada de partido e `idBloco` para "Bl ..."/"Fdr ...", ambos apurados
     * contra a composição real de `blocoPartido`.
     *
     * Antes o backend adivinhava isso do NOME da bancada. Funcionava para
     * federações ("Fdr PT-PCdoB-PV"), mas nunca para blocos: "Bl UniPpPsd..."
     * vem abreviado e truncado.
     */
    it('should read the resolution the ETL wrote, not the bench name', async () => {
      const sql = await capturarRegraDeBancada();

      expect(sql).toContain('o.siglaPartido');
      expect(sql).toContain('o.idBloco');
      expect(sql).toContain('blocoPartido');
    });

    /** Nada de inferir composição a partir de letras soltas do nome. */
    it('should not parse the bench name', async () => {
      const sql = await capturarRegraDeBancada();

      expect(sql).not.toContain('FIND_IN_SET');
      expect(sql).not.toContain('siglaBancada');
      expect(sql).not.toMatch(/LIKE/i);
    });

    it('should count votings whose bench could not be resolved', async () => {
      deputado();
      responder([], 37);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.bancadaNaoResolvida).toBe(37);
    });

    /**
     * Sobram Governo/Maioria/Minoria/Oposição, que não representam partido
     * nenhum. Dizer "sem dado" seria empurrar para o dado uma limitação nossa.
     */
    it('should distinguish an unresolved bench from missing data', async () => {
      deputado();
      responder([], 12);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.motivo).toBe('BANCADA_NAO_RESOLVIDA');
      expect(result.taxa).toBeNull();
    });

    it('should still report missing data when there is no orientation at all', async () => {
      deputado();
      responder([], 0);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.motivo).toBe('SEM_VOTOS_COMPARAVEIS');
    });

    /** Com amostra suficiente, o contador não muda o resultado — só informa. */
    it('should not let unresolved benches suppress a valid rate', async () => {
      deputado();
      responder(comparacoes(20, 0), 9);

      const result = await service.getAlignmentByParliamentarianId(1);

      expect(result.taxa).toBe(100);
      expect(result.motivo).toBeNull();
      expect(result.bancadaNaoResolvida).toBe(9);
    });
  });

  /**
   * Lê a regra de pertencimento da bancada.
   *
   * Ela é um `Prisma.sql` interpolado na consulta, então no array do template
   * aparece só como `?` — o texto vive no valor interpolado, não nas partes.
   */
  async function capturarRegraDeBancada(): Promise<string> {
    deputado();
    responder([]);
    await service.getAlignmentByParliamentarianId(1);

    const [, ...valores] = prismaMock.$queryRaw.mock.calls[0];
    const fragmento = valores.find(
      (v: unknown) => typeof (v as { sql?: string })?.sql === 'string',
    );

    return String((fragmento as { sql: string }).sql);
  }
});
