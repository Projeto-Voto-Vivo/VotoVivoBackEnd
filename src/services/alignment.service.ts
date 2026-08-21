import { PrismaClient } from '@prisma/client';
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

type LinhaAgregada = { orientacao: string | null; voto: string; total: bigint | number };

export type MotivoSemTaxa =
  /** O agregador só coleta orientação de bancada da Câmara. */
  | 'ORIENTACAO_INDISPONIVEL_SENADO'
  /** Nenhum voto do parlamentar tem orientação correspondente para comparar. */
  | 'SEM_VOTOS_COMPARAVEIS'
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
        minimoParaTaxa: MINIMO_PARA_TAXA,
        fonteFiliacao: null,
      };
    }

    // Agregacao em SQL: o resultado tem, no maximo, algumas dezenas de linhas
    // (orientacao x voto), em vez de trazer todos os votos para a memoria.
    //
    // A subquery correlacionada resolve o partido vigente na data da votacao.
    // Um LEFT JOIN em filiacaoPartidaria duplicaria linhas quando ha filiacoes
    // sobrepostas; o LIMIT 1 impede isso.
    const linhas = await this.prisma.$queryRaw<LinhaAgregada[]>`
      SELECT o.orientacao AS orientacao,
             v.votoRegistrado AS voto,
             COUNT(*) AS total
      FROM voto v
      JOIN votacao va    ON va.idVotacao = v.idVotacao
      JOIN parlamentar p ON p.idParlamentar = v.idParlamentar
      JOIN orientacaoVotacao o
        ON o.idVotacao = v.idVotacao
       AND o.siglaBancada = COALESCE((
             SELECT f.siglaPartido
             FROM filiacaoPartidaria f
             WHERE f.idParlamentar = v.idParlamentar
               AND (f.dataInicio IS NULL OR f.dataInicio <= DATE(va.dataHora))
               AND (f.dataFim    IS NULL OR f.dataFim    >= DATE(va.dataHora))
             ORDER BY f.dataInicio DESC
             LIMIT 1
           ), p.partidoAtual)
      WHERE v.idParlamentar = ${parliamentarianId}
        AND va.dataHora IS NOT NULL
        AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
      GROUP BY o.orientacao, v.votoRegistrado
    `;

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
        : consideradas === 0
          ? 'SEM_VOTOS_COMPARAVEIS'
          : 'AMOSTRA_INSUFICIENTE',
      seguiu,
      divergiu,
      consideradas,
      liberadas,
      minimoParaTaxa: MINIMO_PARA_TAXA,
      fonteFiliacao: filiacoes > 0 ? 'historico' : 'partidoAtual',
    };
  }
}
