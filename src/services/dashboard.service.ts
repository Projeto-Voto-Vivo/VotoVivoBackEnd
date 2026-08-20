import { Prisma, PrismaClient } from '@prisma/client';
import { InvalidParameterError, NotFoundError } from '../errors/http-errors';
import { cargoDaCasa } from '../lib/casas';
import { CAMPO_METRICA, COLUNA_METRICA, Metrica, toNumber } from '../lib/metricas';
import { AlignmentService } from './alignment.service';
import { ParliamentarianService } from './parliamentarian.service';

/**
 * Agregados dos dashboards.
 *
 * Regras transversais, aplicadas como codigo e nao como convencao:
 *  - agregar EM SQL, nunca com `reduce` sobre listas completas;
 *  - toda metrica monetaria declara qual valor usou (`empenhado` != `pago`);
 *  - rankings entre casas ficam separados ou explicitamente normalizados;
 *  - todo payload carrega `metadata` com metrica, janela e exclusoes.
 */

/** Inicio do mandato coberto pelo ETL (janela padrao do agregador). */
const INICIO_PADRAO = new Date('2023-01-01T00:00:00Z');

const MAX_COMPARACAO = 4;

type TotalEmendasFiltros = { ano?: number; tipo?: string; metrica: Metrica };
type TopEmendasFiltros = {
  casa: string;
  ano?: number;
  limit: number;
  confiancaMinima: number;
  metrica: Metrica;
};
type TopDespesasFiltros = {
  casa: string;
  ano?: number;
  limit: number;
  normalizar?: string;
};
type ComparacaoFiltros = {
  ids: number[];
  permitirCasasDistintas: boolean;
  metrica: Metrica;
};

export class DashboardService {
  private readonly parliamentarianService: ParliamentarianService;
  private readonly alignmentService: AlignmentService;

  constructor(private readonly prisma: PrismaClient) {
    this.parliamentarianService = new ParliamentarianService(prisma);
    this.alignmentService = new AlignmentService(prisma);
  }

  /**
   * Total nacional. Agrega sobre `emenda`, entao INCLUI emendas de bancada e de
   * comissao — que nao aparecem no ranking por parlamentar. A diferenca entre
   * este numero e a soma do ranking e esperada, e esta declarada em `metadata`.
   */
  async getTotalEmendas(filtros: TotalEmendasFiltros) {
    const campo = CAMPO_METRICA[filtros.metrica];

    const where: Prisma.AmendmentWhereInput = {
      ...(filtros.ano ? { year: filtros.ano } : {}),
      ...(filtros.tipo ? { amendmentType: filtros.tipo } : {}),
    };

    const resultado = await this.prisma.amendment.aggregate({
      where,
      _sum: { [campo]: true } as Prisma.AmendmentSumAggregateInputType,
      _count: { _all: true },
    });

    return {
      total: toNumber((resultado._sum as Record<string, unknown>)[campo]),
      totalEmendas: resultado._count._all,
      metadata: {
        metrica: filtros.metrica,
        janela: { ano: filtros.ano ?? 'todos' },
        tipo: filtros.tipo ?? 'todos',
        exclusoes: [],
        observacao:
          'Total nacional: inclui emendas de bancada e de comissão, que não têm vínculo a parlamentar individual.',
      },
    };
  }

  /**
   * Ranking por parlamentar. `groupBy` do Prisma nao serve: a soma e de uma
   * coluna da tabela relacionada (`emenda`), nao da tabela agrupada.
   */
  async getTopEmendas(filtros: TopEmendasFiltros) {
    const cargo = cargoDaCasa(filtros.casa);
    const coluna = Prisma.raw(COLUNA_METRICA[filtros.metrica]);
    const limite = Prisma.raw(String(filtros.limit));
    const filtroAno = filtros.ano ? Prisma.sql`AND e.ano = ${filtros.ano}` : Prisma.empty;

    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.idParlamentar          AS id,
             p.nomeUrna               AS nomeParlamentar,
             p.partidoAtual           AS siglaPartido,
             p.uf                     AS uf,
             p.cargo                  AS cargo,
             COUNT(DISTINCT e.idEmenda) AS totalEmendas,
             COALESCE(SUM(e.${coluna}), 0) AS valor
      FROM emendaParlamentar ep
      JOIN emenda e      ON e.idEmenda = ep.idEmenda
      JOIN parlamentar p ON p.idParlamentar = ep.idParlamentar
      WHERE p.cargo = ${cargo}
        ${filtroAno}
        AND (ep.confiancaVinculo IS NULL OR ep.confiancaVinculo >= ${filtros.confiancaMinima})
      GROUP BY p.idParlamentar, p.nomeUrna, p.partidoAtual, p.uf, p.cargo
      ORDER BY valor DESC
      LIMIT ${limite}
    `;

    return {
      data: linhas.map((linha) => ({
        id: toNumber(linha.id),
        nomeParlamentar: linha.nomeParlamentar ?? '',
        siglaPartido: linha.siglaPartido ?? '',
        uf: linha.uf ?? '',
        cargo: linha.cargo ?? '',
        totalEmendas: toNumber(linha.totalEmendas),
        valor: toNumber(linha.valor),
      })),
      metadata: {
        metrica: filtros.metrica,
        casa: filtros.casa,
        janela: { ano: filtros.ano ?? 'todos' },
        confiancaMinima: filtros.confiancaMinima,
        exclusoes: [
          'emendas sem vínculo a parlamentar (autoria ambígua, bancada, comissão ou ex-parlamentar)',
          `vínculos com confiancaVinculo abaixo de ${filtros.confiancaMinima}`,
        ],
      },
    };
  }

  /**
   * Ranking de despesas. `casa` e obrigatorio: CEAP (Camara) e CEAPS (Senado)
   * tem tetos e regras diferentes, entao um ranking misto nao significa nada.
   *
   * Com `normalizar=mes`, a divisao pelos meses de exercicio acontece EM SQL —
   * normalizar depois do `ORDER BY ... LIMIT` ja teria descartado os candidatos
   * certos.
   */
  async getTopDespesas(filtros: TopDespesasFiltros) {
    const cargo = cargoDaCasa(filtros.casa);
    const limite = Prisma.raw(String(filtros.limit));
    const normalizar = filtros.normalizar === 'mes';

    if (filtros.normalizar && !normalizar) {
      throw new InvalidParameterError('normalizar');
    }

    const inicio = filtros.ano ? new Date(Date.UTC(filtros.ano, 0, 1)) : INICIO_PADRAO;
    const fim = filtros.ano ? new Date(Date.UTC(filtros.ano, 11, 31)) : new Date();

    const ordenacao = Prisma.raw(normalizar ? 'totalNormalizado' : 'total');

    const linhas = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH exercicio AS (
        SELECT me.idParlamentar,
               SUM(GREATEST(0, TIMESTAMPDIFF(
                 MONTH,
                 GREATEST(me.dataInicio, ${inicio}),
                 LEAST(COALESCE(me.dataFim, ${fim}), ${fim})
               ) + 1)) AS meses
        FROM mandatoExercicio me
        WHERE me.dataInicio <= ${fim}
          AND (me.dataFim IS NULL OR me.dataFim >= ${inicio})
        GROUP BY me.idParlamentar
      )
      SELECT p.idParlamentar AS id,
             p.nomeUrna      AS nomeParlamentar,
             p.partidoAtual  AS siglaPartido,
             p.uf            AS uf,
             COALESCE(SUM(d.valor), 0) AS total,
             COALESCE(x.meses, 0)      AS mesesExercicio,
             COALESCE(SUM(d.valor), 0) / GREATEST(COALESCE(x.meses, 1), 1) AS totalNormalizado
      FROM despesa d
      JOIN parlamentar p ON p.idParlamentar = d.idParlamentar
      LEFT JOIN exercicio x ON x.idParlamentar = d.idParlamentar
      WHERE p.cargo = ${cargo}
        AND d.dataDespesa >= ${inicio}
        AND d.dataDespesa <= ${fim}
      GROUP BY p.idParlamentar, p.nomeUrna, p.partidoAtual, p.uf, x.meses
      ORDER BY ${ordenacao} DESC
      LIMIT ${limite}
    `;

    return {
      data: linhas.map((linha) => ({
        id: toNumber(linha.id),
        nomeParlamentar: linha.nomeParlamentar ?? '',
        siglaPartido: linha.siglaPartido ?? '',
        uf: linha.uf ?? '',
        total: toNumber(linha.total),
        mesesExercicio: toNumber(linha.mesesExercicio),
        totalNormalizado: normalizar ? toNumber(linha.totalNormalizado) : null,
      })),
      metadata: {
        metrica: 'valor da despesa (cota parlamentar)',
        casa: filtros.casa,
        janela: { inicio: inicio.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] },
        normalizacao: normalizar ? 'por mês de exercício (mandatoExercicio)' : 'nenhuma',
        exclusoes: [
          'parlamentares sem despesa na janela',
          ...(normalizar ? ['parlamentares sem registro em mandatoExercicio usam divisor 1'] : []),
        ],
        observacao:
          'CEAP (Câmara) e CEAPS (Senado) têm tetos e regras distintos — não compare rankings de casas diferentes.',
      },
    };
  }

  /**
   * Comparacao entre parlamentares com metricas normalizadas.
   *
   * Recusa comparar casas diferentes sem flag explicita: presenca, cota e
   * emendas seguem regras distintas em cada casa, e um grafico lado a lado
   * sugere equivalencia que nao existe.
   */
  async compare(filtros: ComparacaoFiltros) {
    if (filtros.ids.length < 2) {
      throw new InvalidParameterError('ids', 'Informe ao menos dois parlamentares em: ids.');
    }

    if (filtros.ids.length > MAX_COMPARACAO) {
      throw new InvalidParameterError(
        'ids',
        `Máximo de ${MAX_COMPARACAO} parlamentares por comparação.`,
      );
    }

    const parlamentares = await this.prisma.parliamentarian.findMany({
      where: { id: { in: filtros.ids } },
      select: { id: true, ballotName: true, currentParty: true, state: true, role: true },
    });

    if (parlamentares.length !== filtros.ids.length) {
      throw new NotFoundError('Parlamentar não encontrado.');
    }

    const casas = [...new Set(parlamentares.map((p) => p.role ?? 'desconhecido'))];

    if (casas.length > 1 && !filtros.permitirCasasDistintas) {
      throw new InvalidParameterError(
        'permitirCasasDistintas',
        `Comparação entre casas distintas (${casas.join(', ')}) exige permitirCasasDistintas=true: ` +
          'presença, cota parlamentar e emendas seguem regras diferentes em cada casa.',
      );
    }

    const campo = CAMPO_METRICA[filtros.metrica];

    const data = await Promise.all(
      parlamentares.map(async (parlamentar) => {
        const [despesas, presenca, alinhamento, emendas, meses] = await Promise.all([
          this.prisma.expense.aggregate({
            where: { parliamentarianId: parlamentar.id },
            _sum: { amount: true },
          }),
          this.parliamentarianService.getPresenceByParliamentarianId(parlamentar.id),
          this.alignmentService.getAlignmentByParliamentarianId(parlamentar.id),
          this.prisma.amendment.aggregate({
            where: { parliamentarianLinks: { some: { parliamentarianId: parlamentar.id } } },
            _sum: { [campo]: true } as Prisma.AmendmentSumAggregateInputType,
          }),
          this.countMesesExercicio(parlamentar.id),
        ]);

        const totalDespesas = toNumber(despesas._sum.amount);

        return {
          id: parlamentar.id,
          nomeParlamentar: parlamentar.ballotName ?? '',
          siglaPartido: parlamentar.currentParty ?? '',
          uf: parlamentar.state ?? '',
          cargo: parlamentar.role,
          mesesExercicio: meses,
          despesas: {
            total: totalDespesas,
            // `null` e nao `0`: sem meses de exercicio nao ha media a informar.
            porMesDeExercicio: meses > 0 ? totalDespesas / meses : null,
          },
          emendas: {
            metrica: filtros.metrica,
            total: toNumber((emendas._sum as Record<string, unknown>)[campo]),
          },
          presenca: presenca.presenca,
          alinhamento,
        };
      }),
    );

    return {
      data,
      metadata: {
        metrica: filtros.metrica,
        casas,
        comparacaoEntreCasas: casas.length > 1,
        exclusoes: ['emendas sem vínculo a parlamentar'],
        observacao:
          'Presença traz a metodologia de cada casa; compare apenas baldes equivalentes (ex.: plenario/deliberativas).',
      },
    };
  }

  private async countMesesExercicio(parliamentarianId: number): Promise<number> {
    const linhas = await this.prisma.$queryRaw<{ meses: bigint | number | null }[]>`
      SELECT SUM(GREATEST(0, TIMESTAMPDIFF(
               MONTH, me.dataInicio, COALESCE(me.dataFim, CURDATE())
             ) + 1)) AS meses
      FROM mandatoExercicio me
      WHERE me.idParlamentar = ${parliamentarianId}
    `;

    return toNumber(linhas[0]?.meses);
  }
}
