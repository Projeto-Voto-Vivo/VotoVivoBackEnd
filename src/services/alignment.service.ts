import { Prisma, PrismaClient } from '@prisma/client';
import { normalizar } from '../domain/presence';

/**
 * "O parlamentar seguiu a orientacao do partido?"
 *
 * Substitui o `alinhamento: null` hardcoded do perfil agregado.
 *
 * Duas armadilhas que este servico existe para evitar:
 *
 *  1. O partido tem de ser o da DATA DA VOTACAO, nao o `partidoAtual`. Quem
 *     trocou de partido no meio do mandato seria comparado contra a bancada
 *     errada em todo o historico anterior a troca.
 *  2. As orientacoes vem cruas do dump da Camara ('Sim', 'Nao', 'Abstencao',
 *     'Obstrucao', 'Liberado', 'Artigo 17'). "Liberado" e "Artigo 17" NAO sao
 *     orientacao: esses votos saem do denominador em vez de contar como
 *     divergencia.
 *
 * O agregador so grava orientacao da Camara — para senadores o resultado e
 * indisponivel com motivo explicito, nunca 0%.
 */

/** Votos com conteudo comparavel. Ausencias nao tem voto a comparar. */
const VOTOS_COMPARAVEIS = ['SIM', 'NAO', 'ABSTENCAO', 'OBSTRUCAO'];

/** Orientacao normalizada -> valor do enum de voto. */
const ORIENTACAO_PARA_VOTO: Record<string, string> = {
  sim: 'SIM',
  nao: 'NAO',
  abstencao: 'ABSTENCAO',
  obstrucao: 'OBSTRUCAO',
};

/** Marcadores que significam "sem orientacao": saem do denominador. */
const SEM_ORIENTACAO = new Set(['liberado', 'liberacao', 'artigo 17', 'art. 17', '']);

export const MINIMO_PARA_TAXA = 20;

/**
 * Partido vigente na DATA da votacao. A subquery correlacionada (em vez de um
 * LEFT JOIN) impede duplicacao de linhas quando ha filiacoes sobrepostas.
 */
const PARTIDO_NA_DATA = Prisma.sql`COALESCE((
  SELECT f.siglaPartido
  FROM filiacaoPartidaria f
  WHERE f.idParlamentar = v.idParlamentar
    AND (f.dataInicio IS NULL OR f.dataInicio <= DATE(va.dataHora))
    AND (f.dataFim    IS NULL OR f.dataFim    >= DATE(va.dataHora))
  ORDER BY f.dataInicio DESC
  LIMIT 1
), p.partidoAtual)`;

/**
 * "Esta bancada representa o partido do parlamentar?"
 *
 * A resposta vem PRONTA do ETL. `orientacaoVotacao` traz duas colunas
 * resolvidas contra a composicao real de `bloco`/`blocoPartido`:
 *
 *   siglaPartido   bancada de partido        -> compara direto
 *   idBloco        "Bl ..." ou "Fdr ..."     -> o partido esta em blocoPartido
 *   ambos NULL     Governo/Maioria/Minoria   -> nao representa partido nenhum
 *
 * Antes o backend tentava adivinhar isso do NOME da bancada, com `FIND_IN_SET`
 * sobre "Fdr PT-PCdoB-PV". Funcionava para federacoes, mas nunca para blocos:
 * "Bl UniPpPsd..." vem abreviado E truncado, e inferir a composicao de letras
 * soltas seria chute. Com a resolucao no ETL, os ~18% de deputados de bloco
 * deixam de cair em `BANCADA_NAO_RESOLVIDA`.
 */
const BANCADA_REPRESENTA_O_PARTIDO = Prisma.sql`(
  o.siglaPartido = ${PARTIDO_NA_DATA}
  OR (
    o.idBloco IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM blocoPartido bp
      WHERE bp.idBloco = o.idBloco
        AND bp.siglaPartido = ${PARTIDO_NA_DATA}
    )
  )
)`;

type LinhaAgregada = { orientacao: string | null; voto: string; total: bigint | number };

export type MotivoSemTaxa =
  /** O agregador só coleta orientação de bancada da Câmara. */
  | 'ORIENTACAO_INDISPONIVEL_SENADO'
  /** Nenhum voto do parlamentar tem orientação correspondente para comparar. */
  | 'SEM_VOTOS_COMPARAVEIS'
  /**
   * As votações têm orientação publicada, mas nenhuma bancada representava o
   * partido do parlamentar: ele está fora de bloco e o partido não orientou
   * por conta própria, restando só as transversais (Governo, Maioria, Minoria,
   * Oposição). Diferente de `SEM_VOTOS_COMPARAVEIS`, em que não havia
   * orientação nenhuma — aqui o dado existe e simplesmente não fala do
   * partido dele, e a interface deve dizer isso.
   */
  | 'BANCADA_NAO_RESOLVIDA'
  /** Há comparações, mas poucas para uma percentagem significar algo. */
  | 'AMOSTRA_INSUFICIENTE';

/**
 * Formato uniforme de propósito: os contadores vêm sempre, e `taxa: null` com
 * `motivo` preenchido cobre os três casos em que a percentagem não deve ser
 * exibida. Um payload que muda de forma obrigaria o cliente a checar a
 * existência de cada campo antes de ler.
 */
export type Alinhamento = {
  /** Há orientação de bancada disponível para esta casa legislativa. */
  disponivel: boolean;
  taxa: number | null;
  /** Preenchido sempre que `taxa` é `null`. */
  motivo: MotivoSemTaxa | null;
  seguiu: number;
  divergiu: number;
  consideradas: number;
  liberadas: number;
  /**
   * Votações em que o parlamentar votou e havia orientação publicada, mas
   * nenhuma bancada pôde ser associada ao partido dele. Fica fora da conta —
   * declarado em vez de silencioso, porque é limitação nossa e não do dado.
   */
  bancadaNaoResolvida: number;
  minimoParaTaxa: number;
  fonteFiliacao: 'historico' | 'partidoAtual' | null;
};

export class AlignmentService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAlignmentByParliamentarianId(parliamentarianId: number): Promise<Alinhamento> {
    const [parliamentarian, filiacoes] = await Promise.all([
      this.prisma.parliamentarian.findUnique({
        where: { id: parliamentarianId },
        select: { role: true },
      }),
      this.prisma.partyAffiliation.count({ where: { parliamentarianId } }),
    ]);

    if (normalizar(parliamentarian?.role).startsWith('senador')) {
      return {
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
      };
    }

    const [linhas, naoResolvidas] = await Promise.all([
      // Agregacao em SQL: o resultado tem, no maximo, algumas dezenas de linhas
      // (orientacao x voto), em vez de trazer todos os votos para a memoria.
      this.prisma.$queryRaw<LinhaAgregada[]>`
        SELECT o.orientacao AS orientacao,
               v.votoRegistrado AS voto,
               COUNT(*) AS total
        FROM voto v
        JOIN votacao va    ON va.idVotacao = v.idVotacao
        JOIN parlamentar p ON p.idParlamentar = v.idParlamentar
        JOIN orientacaoVotacao o
          ON o.idVotacao = v.idVotacao
         AND ${BANCADA_REPRESENTA_O_PARTIDO}
        WHERE v.idParlamentar = ${parliamentarianId}
          AND va.dataHora IS NOT NULL
          AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
        GROUP BY o.orientacao, v.votoRegistrado
      `,
      // Votacoes com orientacao publicada em que nenhuma bancada representa o
      // partido do parlamentar. Sem este contador, um deputado de bloco fica
      // indistinguivel de um sem dado nenhum.
      this.prisma.$queryRaw<{ total: bigint | number }[]>`
        SELECT COUNT(*) AS total
        FROM voto v
        JOIN votacao va    ON va.idVotacao = v.idVotacao
        JOIN parlamentar p ON p.idParlamentar = v.idParlamentar
        WHERE v.idParlamentar = ${parliamentarianId}
          AND va.dataHora IS NOT NULL
          AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
          AND EXISTS (
            SELECT 1 FROM orientacaoVotacao o WHERE o.idVotacao = v.idVotacao
          )
          AND NOT EXISTS (
            SELECT 1 FROM orientacaoVotacao o
            WHERE o.idVotacao = v.idVotacao
              AND ${BANCADA_REPRESENTA_O_PARTIDO}
          )
      `,
    ]);

    const bancadaNaoResolvida = Number(naoResolvidas[0]?.total ?? 0);

    let seguiu = 0;
    let divergiu = 0;
    let liberadas = 0;

    for (const linha of linhas) {
      const total = Number(linha.total);
      const orientacao = normalizar(linha.orientacao);

      if (SEM_ORIENTACAO.has(orientacao)) {
        liberadas += total;
        continue;
      }

      const esperado = ORIENTACAO_PARA_VOTO[orientacao];

      if (!esperado) {
        // Orientacao desconhecida: nao inventa divergencia.
        liberadas += total;
        continue;
      }

      if (VOTOS_COMPARAVEIS.includes(linha.voto) && linha.voto === esperado) {
        seguiu += total;
      } else {
        divergiu += total;
      }
    }

    const consideradas = seguiu + divergiu;
    const temAmostra = consideradas >= MINIMO_PARA_TAXA;

    return {
      disponivel: true,
      // A taxa só é publicada com amostra suficiente. Os contadores vêm sempre,
      // para a interface poder mostrar "N votações comparadas" em vez de uma
      // percentagem que não significa nada.
      taxa: temAmostra ? Number(((seguiu / consideradas) * 100).toFixed(1)) : null,
      motivo: temAmostra
        ? null
        : consideradas > 0
          ? 'AMOSTRA_INSUFICIENTE'
          : // Sem nenhuma comparação, a causa importa: se havia orientação
            // publicada e nenhuma bancada representava o partido dele, o dado
            // existe — dizer "sem dado" seria enganoso.
            bancadaNaoResolvida > 0
            ? 'BANCADA_NAO_RESOLVIDA'
            : 'SEM_VOTOS_COMPARAVEIS',
      seguiu,
      divergiu,
      consideradas,
      liberadas,
      bancadaNaoResolvida,
      minimoParaTaxa: MINIMO_PARA_TAXA,
      fonteFiliacao: filiacoes > 0 ? 'historico' : 'partidoAtual',
    };
  }
}
