import { MINIMO_POR_TEMA, ThemeAlignmentService } from './theme-alignment.service';
import { MINIMO_PARA_TAXA } from './alignment.service';

describe('ThemeAlignmentService', () => {
  let prismaMock: any;
  let service: ThemeAlignmentService;

  beforeEach(() => {
    prismaMock = {
      parliamentarian: { findUnique: jest.fn() },
      partyAffiliation: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };

    service = new ThemeAlignmentService(prismaMock);
  });

  /** Linhas de um tema: N seguindo a orientação e M divergindo dela. */
  const tema = (nome: string, seguiu: number, divergiu: number) => [
    { tema: nome, orientacao: 'Sim', voto: 'SIM', total: BigInt(seguiu) },
    { tema: nome, orientacao: 'Sim', voto: 'NAO', total: BigInt(divergiu) },
  ];

  /**
   * As consultas saem em duas ondas: primeiro o alinhamento geral (agregação +
   * bancadas não resolvidas), depois as três por tema.
   */
  const responder = (opcoes: {
    geral?: unknown[];
    geralNaoResolvidas?: number;
    temas?: unknown[];
    naoResolvidasPorTema?: unknown[];
    semProposicao?: number;
    semTema?: number;
  }) => {
    prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Deputado(a)' });
    prismaMock.partyAffiliation.count.mockResolvedValue(3);

    prismaMock.$queryRaw
      .mockResolvedValueOnce(opcoes.geral ?? [])
      .mockResolvedValueOnce([{ total: BigInt(opcoes.geralNaoResolvidas ?? 0) }])
      .mockResolvedValueOnce(opcoes.temas ?? [])
      .mockResolvedValueOnce(opcoes.naoResolvidasPorTema ?? [])
      .mockResolvedValueOnce([{ total: BigInt(opcoes.semProposicao ?? 0) }])
      .mockResolvedValueOnce([{ total: BigInt(opcoes.semTema ?? 0) }]);
  };

  describe('recorte por tema', () => {
    it('should compute a rate per theme', async () => {
      responder({
        geral: [
          { orientacao: 'Sim', voto: 'SIM', total: BigInt(80) },
          { orientacao: 'Sim', voto: 'NAO', total: BigInt(20) },
        ],
        temas: [...tema('Meio Ambiente', 6, 14), ...tema('Direito Penal', 19, 1)],
      });

      const result = await service.getThemeAlignment(1);

      const meioAmbiente = result.temas.find((t) => t.tema === 'Meio Ambiente');
      const penal = result.temas.find((t) => t.tema === 'Direito Penal');

      expect(meioAmbiente).toMatchObject({ seguiu: 6, divergiu: 14, consideradas: 20, taxa: 30 });
      expect(penal).toMatchObject({ seguiu: 19, divergiu: 1, consideradas: 20, taxa: 95 });
    });

    /**
     * O contraste é a leitura inteira do endpoint: "88% no geral, 30% em meio
     * ambiente". Sem o total junto, a interface precisaria de uma segunda
     * requisição só para ter com o que comparar.
     */
    it('should return the overall rate alongside the themes', async () => {
      responder({
        geral: [
          { orientacao: 'Sim', voto: 'SIM', total: BigInt(88) },
          { orientacao: 'Sim', voto: 'NAO', total: BigInt(12) },
        ],
        temas: tema('Meio Ambiente', 6, 14),
      });

      const result = await service.getThemeAlignment(1);

      expect(result.geral.taxa).toBe(88);
      expect(result.geral.consideradas).toBe(100);
    });

    /**
     * Por evidência, não por taxa: um tema com 100% sobre 12 comparações não
     * pode encabeçar a lista de um com 88% sobre 60.
     */
    it('should rank by number of comparisons, not by rate', async () => {
      responder({
        temas: [...tema('Tributário', 12, 0), ...tema('Saúde', 30, 30)],
      });

      const result = await service.getThemeAlignment(1);

      expect(result.temas.map((t) => t.tema)).toEqual(['Saúde', 'Tributário']);
    });

    it('should truncate to the requested limit and say how many exist', async () => {
      responder({
        temas: [
          ...tema('Saúde', 30, 0),
          ...tema('Educação', 20, 0),
          ...tema('Tributário', 10, 0),
        ],
      });

      const result = await service.getThemeAlignment(1, 2);

      expect(result.temas).toHaveLength(2);
      expect(result.metadata.temasComparados).toBe(3);
    });
  });

  describe('amostra mínima', () => {
    /**
     * O piso por tema é menor que o do total de propósito, mas continua sendo
     * um piso: abaixo dele a percentagem não sai.
     */
    it('should withhold the rate of a thin theme', async () => {
      responder({ temas: tema('Cultura', MINIMO_POR_TEMA - 1, 0) });

      const result = await service.getThemeAlignment(1);

      expect(result.temas[0].taxa).toBeNull();
      expect(result.temas[0].motivo).toBe('AMOSTRA_INSUFICIENTE');
      expect(result.temas[0].consideradas).toBe(MINIMO_POR_TEMA - 1);
    });

    /** Um piso menor que o geral não é acidente — vai declarado no payload. */
    it('should declare both thresholds', async () => {
      responder({ temas: tema('Cultura', 30, 0) });

      const result = await service.getThemeAlignment(1);

      expect(result.metadata.minimoParaTaxa).toBe(MINIMO_POR_TEMA);
      expect(result.metadata.minimoParaTaxaGeral).toBe(MINIMO_PARA_TAXA);
      expect(MINIMO_POR_TEMA).toBeLessThan(MINIMO_PARA_TAXA);
    });
  });

  describe('o que não entra na conta', () => {
    /**
     * "Liberado" não é orientação: contar como divergência transformaria uma
     * liberação de bancada em deslealdade.
     */
    it('should keep released votes out of the denominator', async () => {
      responder({
        temas: [
          { tema: 'Saúde', orientacao: 'Sim', voto: 'SIM', total: BigInt(20) },
          { tema: 'Saúde', orientacao: 'Liberado', voto: 'NAO', total: BigInt(7) },
          { tema: 'Saúde', orientacao: 'Artigo 17', voto: 'NAO', total: BigInt(3) },
        ],
      });

      const result = await service.getThemeAlignment(1);

      expect(result.temas[0]).toMatchObject({
        seguiu: 20,
        divergiu: 0,
        consideradas: 20,
        liberadas: 10,
      });
    });

    /**
     * Um tema onde o partido nunca orientou é resposta, não ausência: se ele
     * sumisse da lista, a interface leria "sem dado" onde há dado.
     */
    it('should list a theme that only has unresolved benches', async () => {
      responder({
        temas: tema('Saúde', 30, 0),
        naoResolvidasPorTema: [{ tema: 'Cultura', total: BigInt(14) }],
      });

      const result = await service.getThemeAlignment(1);

      const cultura = result.temas.find((t) => t.tema === 'Cultura');

      expect(cultura).toMatchObject({
        consideradas: 0,
        bancadaNaoResolvida: 14,
        taxa: null,
        motivo: 'BANCADA_NAO_RESOLVIDA',
      });
    });

    it('should report the votes no theme classifies', async () => {
      responder({ temas: tema('Saúde', 30, 0), semProposicao: 41, semTema: 9 });

      const result = await service.getThemeAlignment(1);

      expect(result.excluidos).toEqual({
        votosSemProposicao: 41,
        votosEmProposicaoSemTema: 9,
      });
    });

    /**
     * A soma dos temas é maior que o total porque a proposição conta em cada
     * tema dela. Se a interface somar a lista sem saber disso, mostra um número
     * que não existe.
     */
    it('should warn that the themes do not add up to the total', async () => {
      responder({ temas: tema('Saúde', 30, 0) });

      const result = await service.getThemeAlignment(1);

      expect(result.metadata.observacao).toContain('vários temas');
      expect(result.metadata.observacao).toContain('geral.consideradas');
    });
  });

  describe('senador', () => {
    /**
     * Sem orientação de bancada não há o que abrir por tema. O que não pode
     * acontecer é a lista vazia sair sem motivo: seria idêntica à de um
     * deputado que nunca divergiu.
     */
    it('should not run the theme queries without a source', async () => {
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Senador(a)' });
      prismaMock.partyAffiliation.count.mockResolvedValue(1);

      const result = await service.getThemeAlignment(1);

      expect(result.disponivel).toBe(false);
      expect(result.temas).toEqual([]);
      expect(result.geral.motivo).toBe('ORIENTACAO_INDISPONIVEL_SENADO');
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('filtro por objeto', () => {
    /**
     * O texto da consulta nao basta: os fragmentos interpolados chegam ao mock
     * como valores (`Prisma.Sql`), e e neles que o filtro vive. Sem juntar os
     * dois, o teste passaria com o filtro desligado.
     */
    const sqlCompleto = (chamada: any[]) => {
      const [textos, ...valores] = chamada;
      const fragmentos = valores
        .filter((v: unknown) => typeof (v as { sql?: string })?.sql === 'string')
        .map((v: { sql: string }) => v.sql);

      return [textos.join(' '), ...fragmentos].join(' ');
    };

    /** As duas primeiras chamadas sao do alinhamento geral. */
    const consultasPorTema = () => prismaMock.$queryRaw.mock.calls.slice(2).map(sqlCompleto);

    it('should not filter when nothing was asked', async () => {
      responder({ temas: [] });
      await service.getThemeAlignment(1, 10, {});

      for (const sql of consultasPorTema()) {
        expect(sql).not.toMatch(/resumoMateria/i);
      }
    });

    it('should restrict to the merit votings when asked', async () => {
      responder({ temas: [] });
      await service.getThemeAlignment(1, 10, { apenasMerito: true });

      expect(consultasPorTema()[0]).toMatch(/resumoMateria/i);
    });

    /**
     * O mesmo recorte tem de valer para os excluidos. Se a lista contasse so
     * votacoes de merito e os excluidos contassem todas, os numeros do payload
     * parariam de fechar entre si — em silencio.
     */
    it('should apply the same filter to every count in the payload', async () => {
      responder({ temas: [] });
      await service.getThemeAlignment(1, 10, { objeto: 'TEXTO_BASE' });

      const consultas = consultasPorTema();

      expect(consultas).toHaveLength(4);

      for (const sql of consultas) {
        expect(sql).toMatch(/resumoMateria/i);
      }
    });
  });
});
