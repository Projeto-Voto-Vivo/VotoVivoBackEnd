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

type LinhaAgregada = { orientacao: string | null; voto: string; total: bigint | number };

export type Alinhamento =
  | {
      disponivel: false;
      motivo: string;
      taxa: null;
    }
  | {
      disponivel: true;
      taxa: number | null;
      seguiu: number;
      divergiu: number;
      consideradas: number;
      liberadas: number;
      fonteFiliacao: 'historico' | 'partidoAtual';
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
        motivo: 'ORIENTACAO_INDISPONIVEL_SENADO',
        taxa: null,
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

    return {
      disponivel: true,
      taxa: consideradas === 0 ? null : Number(((seguiu / consideradas) * 100).toFixed(1)),
      seguiu,
      divergiu,
      consideradas,
      liberadas,
      fonteFiliacao: filiacoes > 0 ? 'historico' : 'partidoAtual',
    };
  }
}
