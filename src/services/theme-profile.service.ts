import { Prisma, PrismaClient } from '@prisma/client';
import { toNumber } from '../lib/metricas';

/**
 * Perfil temático de um parlamentar: em que temas ele mais legisla e como vota
 * em proposições de cada tema.
 *
 * Três cuidados que este serviço existe para não deixar implícitos:
 *
 *  1. **Uma proposição tem vários temas.** Ela conta uma vez em cada tema, então
 *     a soma da lista é maior que o total de proposições. Sem declarar isso, a
 *     UI soma a lista e mostra um número que não bate com nada.
 *
 *  2. **Nem toda votação tem proposição.** `votacao.idProposicao` é nulo em
 *     requerimentos e questões de ordem; e proposições sem `temaProposicao`
 *     também não classificam. Esses votos saem da conta e são contados à parte,
 *     senão o silêncio vira viés invisível.
 *
 *  3. **SIM/NÃO não é "a favor/contra o tema".** Uma votação pode ser sobre um
 *     destaque supressivo, um requerimento de urgência ou o texto principal —
 *     e `votacao.resumoMateria` é texto livre, então o objeto do voto não é
 *     distinguível. Por isso os campos se chamam `votosSim`/`votosNao`: é o que
 *     o dado sustenta. Interpretar como apoio ao tema é leitura da UI, e a
 *     `observacao` no payload existe para ela não fazer isso sem avisar.
 */

/** Temas retornados por bloco, quando o cliente não pede outro valor. */
const LIMITE_PADRAO = 10;

type LinhaAutoria = { tema: string; total: bigint | number };

type LinhaVoto = {
  tema: string;
  sim: bigint | number | string | null;
  nao: bigint | number | string | null;
  abstencao: bigint | number | string | null;
  obstrucao: bigint | number | string | null;
  total: bigint | number;
};

type Contagem = { total: bigint | number };

export class ThemeProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async getThemeProfile(parliamentarianId: number, limite = LIMITE_PADRAO) {
    const limit = Prisma.raw(String(Math.max(1, Math.trunc(limite))));

    const [autoria, votos, totais] = await Promise.all([
      this.autoriaPorTema(parliamentarianId, limit),
      this.votosPorTema(parliamentarianId, limit),
      this.totais(parliamentarianId),
    ]);

    return {
      proposicoes: {
        temas: autoria.map((linha) => ({
          tema: linha.tema,
          total: toNumber(linha.total),
        })),
        totalProposicoes: totais.proposicoes,
        semTema: totais.proposicoesSemTema,
      },
      votacoes: {
        temas: votos.map((linha) => {
          const sim = toNumber(linha.sim);
          const nao = toNumber(linha.nao);

          return {
            tema: linha.tema,
            votosSim: sim,
            votosNao: nao,
            // Positivo = mais SIM que NÃO em votações de proposições do tema.
            saldo: sim - nao,
            abstencoes: toNumber(linha.abstencao),
            obstrucoes: toNumber(linha.obstrucao),
            totalVotos: toNumber(linha.total),
          };
        }),
        totalVotos: totais.votos,
        excluidos: {
          votosSemProposicao: totais.votosSemProposicao,
          votosEmProposicaoSemTema: totais.votosEmProposicaoSemTema,
        },
      },
      metadata: {
        limite: Number(limite),
        agrupamento: 'tema.descricao',
        observacao:
          'Uma proposição pode ter vários temas e conta em cada um — a soma por tema é maior que o total. ' +
          'votosSim/votosNao são o voto registrado em votações de proposições do tema, não posição sobre o tema: ' +
          'a votação pode ser sobre destaque, requerimento de urgência ou texto principal, e o objeto não é distinguível no dado. ' +
          'Temas da Câmara e do Senado são agrupados apenas quando a descrição é idêntica.',
        exclusoes: [
          'votos em votações sem proposição vinculada (requerimentos, questões de ordem)',
          'votos em proposições sem tema registrado',
          'ausências e voto não registrado (não há posição a contar)',
        ],
      },
    };
  }

  private autoriaPorTema(parliamentarianId: number, limit: Prisma.Sql) {
    // COUNT(DISTINCT idProposicao) e não COUNT(*): a proposição aparece uma vez
    // por tema, mas dentro de um tema não pode contar duas vezes.
    return this.prisma.$queryRaw<LinhaAutoria[]>`
      SELECT t.descricao AS tema,
             COUNT(DISTINCT ap.idProposicao) AS total
      FROM autoriaProposicao ap
      JOIN temaProposicao tp ON tp.idProposicao = ap.idProposicao
      JOIN tema t            ON t.idTema = tp.idTema
      WHERE ap.idParlamentar = ${parliamentarianId}
      GROUP BY t.descricao
      ORDER BY total DESC, t.descricao ASC
      LIMIT ${limit}
    `;
  }

  private votosPorTema(parliamentarianId: number, limit: Prisma.Sql) {
    // Ordena por SIM+NAO, não por total: são os votos com posição de mérito.
    // Um tema com 50 obstruções e 1 SIM não é onde o parlamentar mais se
    // posiciona.
    return this.prisma.$queryRaw<LinhaVoto[]>`
      SELECT t.descricao AS tema,
             SUM(v.votoRegistrado = 'SIM')       AS sim,
             SUM(v.votoRegistrado = 'NAO')       AS nao,
             SUM(v.votoRegistrado = 'ABSTENCAO') AS abstencao,
             SUM(v.votoRegistrado = 'OBSTRUCAO') AS obstrucao,
             COUNT(*) AS total
      FROM voto v
      JOIN votacao va        ON va.idVotacao = v.idVotacao
      JOIN temaProposicao tp ON tp.idProposicao = va.idProposicao
      JOIN tema t            ON t.idTema = tp.idTema
      WHERE v.idParlamentar = ${parliamentarianId}
      GROUP BY t.descricao
      ORDER BY SUM(v.votoRegistrado = 'SIM') + SUM(v.votoRegistrado = 'NAO') DESC,
               t.descricao ASC
      LIMIT ${limit}
    `;
  }

  /** Denominadores e exclusões — o que a lista por tema não mostra. */
  private async totais(parliamentarianId: number) {
    const [proposicoes, proposicoesSemTema, votos, semProposicao, semTema] =
      await Promise.all([
        this.prisma.$queryRaw<Contagem[]>`
          SELECT COUNT(*) AS total FROM autoriaProposicao
          WHERE idParlamentar = ${parliamentarianId}
        `,
        this.prisma.$queryRaw<Contagem[]>`
          SELECT COUNT(*) AS total
          FROM autoriaProposicao ap
          WHERE ap.idParlamentar = ${parliamentarianId}
            AND NOT EXISTS (
              SELECT 1 FROM temaProposicao tp WHERE tp.idProposicao = ap.idProposicao
            )
        `,
        this.prisma.$queryRaw<Contagem[]>`
          SELECT COUNT(*) AS total FROM voto WHERE idParlamentar = ${parliamentarianId}
        `,
        this.prisma.$queryRaw<Contagem[]>`
          SELECT COUNT(*) AS total
          FROM voto v
          JOIN votacao va ON va.idVotacao = v.idVotacao
          WHERE v.idParlamentar = ${parliamentarianId}
            AND va.idProposicao IS NULL
        `,
        this.prisma.$queryRaw<Contagem[]>`
          SELECT COUNT(*) AS total
          FROM voto v
          JOIN votacao va ON va.idVotacao = v.idVotacao
          WHERE v.idParlamentar = ${parliamentarianId}
            AND va.idProposicao IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM temaProposicao tp WHERE tp.idProposicao = va.idProposicao
            )
        `,
      ]);

    return {
      proposicoes: toNumber(proposicoes[0]?.total),
      proposicoesSemTema: toNumber(proposicoesSemTema[0]?.total),
      votos: toNumber(votos[0]?.total),
      votosSemProposicao: toNumber(semProposicao[0]?.total),
      votosEmProposicaoSemTema: toNumber(semTema[0]?.total),
    };
  }
}
