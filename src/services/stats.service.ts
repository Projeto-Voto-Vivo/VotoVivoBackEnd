import { PrismaClient } from '@prisma/client';
import { InvalidParameterError } from '../errors/http-errors';

/** Teto de segurança para o parâmetro `limite`. */
const LIMITE_MAX = 100;

type LinhaDespesa = {
  id: number;
  nomeParlamentar: string | null;
  siglaPartido: string | null;
  uf: string | null;
  urlFoto: string | null;
  cargo: string | null;
  total: unknown; // BigDecimal vindo do $queryRaw — convertido abaixo
};

type LinhaEmenda = {
  id: number;
  nomeParlamentar: string | null;
  siglaPartido: string | null;
  uf: string | null;
  urlFoto: string | null;
  cargo: string | null;
  total: unknown;
};

export class StatsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * GET /stats/emendas/total
   * Soma consolidada de `valorPago` de todas as emendas.
   */
  async getTotalPaidAmendments() {
    const result = await this.prisma.amendment.aggregate({
      _sum: { paidAmount: true },
    });

    return {
      totalPago: Number(result._sum.paidAmount ?? 0),
    };
  }

  /**
   * GET /stats/despesas/ranking?limite=N
   * Top-N parlamentares por soma de despesas (`valor`).
   */
  async getExpenseRanking(limite: number) {
    this.validarLimite(limite);

    // $queryRaw é necessário: agregar `despesa.valor` agrupado por parlamentar
    // com JOIN e ORDER BY não cabe no groupBy do Prisma (FK + tabela diferente).
    const rows = await this.prisma.$queryRaw<LinhaDespesa[]>`
      SELECT
        p.idParlamentar        AS id,
        p.nomeUrna             AS nomeParlamentar,
        p.partidoAtual         AS siglaPartido,
        p.uf                   AS uf,
        p.fotoUrl              AS urlFoto,
        p.cargo                AS cargo,
        COALESCE(SUM(d.valor), 0) AS total
      FROM parlamentar p
      JOIN despesa d ON d.idParlamentar = p.idParlamentar
      GROUP BY
        p.idParlamentar,
        p.nomeUrna,
        p.partidoAtual,
        p.uf,
        p.fotoUrl,
        p.cargo
      ORDER BY total DESC
      LIMIT ${limite}
    `;

    return rows.map((row) => ({
      id: row.id,
      nomeParlamentar: row.nomeParlamentar ?? '',
      siglaPartido: row.siglaPartido ?? '',
      uf: row.uf ?? '',
      urlFoto: row.urlFoto ?? '',
      cargo: row.cargo ?? '',
      totalDespesas: Number(row.total),
    }));
  }

  /**
   * GET /stats/emendas/ranking?limite=N
   * Top-N parlamentares por soma de `valorPago` de emendas vinculadas
   * via `emendaParlamentar → emenda`.
   */
  async getAmendmentRanking(limite: number) {
    this.validarLimite(limite);

    const rows = await this.prisma.$queryRaw<LinhaEmenda[]>`
      SELECT
        p.idParlamentar           AS id,
        p.nomeUrna                AS nomeParlamentar,
        p.partidoAtual            AS siglaPartido,
        p.uf                      AS uf,
        p.fotoUrl                 AS urlFoto,
        p.cargo                   AS cargo,
        COALESCE(SUM(e.valorPago), 0) AS total
      FROM parlamentar p
      JOIN emendaParlamentar ep ON ep.idParlamentar = p.idParlamentar
      JOIN emenda e             ON e.idEmenda = ep.idEmenda
      GROUP BY
        p.idParlamentar,
        p.nomeUrna,
        p.partidoAtual,
        p.uf,
        p.fotoUrl,
        p.cargo
      ORDER BY total DESC
      LIMIT ${limite}
    `;

    return rows.map((row) => ({
      id: row.id,
      nomeParlamentar: row.nomeParlamentar ?? '',
      siglaPartido: row.siglaPartido ?? '',
      uf: row.uf ?? '',
      urlFoto: row.urlFoto ?? '',
      cargo: row.cargo ?? '',
      totalEmendas: Number(row.total),
    }));
  }

  private validarLimite(limite: number) {
    if (!Number.isInteger(limite) || limite <= 0) {
      throw new InvalidParameterError('limite', 'O parâmetro "limite" deve ser um inteiro positivo.');
    }
    if (limite > LIMITE_MAX) {
      throw new InvalidParameterError(
        'limite',
        `O parâmetro "limite" não pode exceder ${LIMITE_MAX}.`,
      );
    }
  }
}
