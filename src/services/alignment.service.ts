import { Prisma, PrismaClient } from '@prisma/client';
import { condicaoDoFiltro, FiltroObjeto } from '../domain/objeto-votacao';
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
export const VOTOS_COMPARAVEIS = ['SIM', 'NAO', 'ABSTENCAO', 'OBSTRUCAO'];

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

const COLUNA_RESUMO = Prisma.sql`va.resumoMateria`;

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

/** Aliases de `orientacaoVotacao` que os fragmentos abaixo sabem qualificar. */
type AliasOrientacao = 'o' | 'o2';

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
 * Antes o backend tentava adivinhar isso do NOME da bancada. Funcionava para
 * federacoes, mas nunca para blocos: "Bl UniPpPsd..." vem abreviado E truncado,
 * e inferir a composicao de letras soltas seria chute.
 *
 * CONTRATO DE ALIAS: quem usar este fragmento precisa ter `v` (voto),
 * `va` (votacao) e `p` (parlamentar) no escopo — `PARTIDO_NA_DATA` os
 * referencia.
 */
export function bancadaRepresentaOPartido(alias: AliasOrientacao): Prisma.Sql {
  const a = Prisma.raw(alias);

  return Prisma.sql`(
    ${a}.siglaPartido = ${PARTIDO_NA_DATA}
    OR (
      ${a}.idBloco IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM blocoPartido bp
        WHERE bp.idBloco = ${a}.idBloco
          AND bp.siglaPartido = ${PARTIDO_NA_DATA}
      )
    )
  )`;
}

/**
 * UMA orientacao por votacao, escolhida de proposito.
 *
 * Mais de uma bancada pode representar o mesmo partido na mesma votacao: nada
 * impede o PT orientar sob a propria sigla e a federacao "Fdr PT-PCdoB-PV"
 * orientar tambem — a chave unica e `(idVotacao, siglaBancada)`, nao o partido.
 * Com um JOIN aberto, esse voto entraria DUAS vezes na conta, e se as duas
 * orientacoes divergissem ele apareceria seguindo e divergindo ao mesmo tempo.
 *
 * A precedencia nao e arbitraria: a orientacao do PROPRIO partido ganha da do
 * bloco, porque a pergunta e "seguiu o partido dele". `idOrientacaoVotacao`
 * como desempate final so existe para o resultado ser deterministico.
 *
 * Mesmo contrato de alias de `bancadaRepresentaOPartido`.
 */
export const ORIENTACAO_DA_BANCADA = Prisma.sql`(
  SELECT o2.idOrientacaoVotacao
  FROM orientacaoVotacao o2
  WHERE o2.idVotacao = v.idVotacao
    AND ${bancadaRepresentaOPartido('o2')}
  ORDER BY (o2.siglaPartido IS NOT NULL) DESC, o2.idOrientacaoVotacao ASC
  LIMIT 1
)`;

/**
 * Voto com orientacao publicada, mas sem nenhuma bancada representando o
 * partido do parlamentar. Fragmento compartilhado para que o contador de
 * excluidos use exatamente o mesmo criterio da conta principal — se
 * divergirem, os numeros do payload param de fechar entre si.
 */
export const BANCADA_NAO_RESOLVIDA_SQL = Prisma.sql`(
  EXISTS (
    SELECT 1 FROM orientacaoVotacao o WHERE o.idVotacao = v.idVotacao
  )
  AND NOT EXISTS (
    SELECT 1 FROM orientacaoVotacao o
    WHERE o.idVotacao = v.idVotacao
      AND ${bancadaRepresentaOPartido('o')}
  )
)`;

export type LinhaComparacao = {
  orientacao: string | null;
  voto: string;
  total: bigint | number | string;
};

/** Resultado da comparacao orientacao x voto, antes de virar percentagem. */
export type Comparacoes = {
  seguiu: number;
  divergiu: number;
  /** Orientacao "Liberado"/"Artigo 17" ou desconhecida: fora do denominador. */
  liberadas: number;
};

/**
 * Dobra as linhas agregadas em contadores.
 *
 * A comparacao semantica fica em TS, e nao em SQL, porque as orientacoes vem
 * cruas e acentuadas do dump — normalizar acento em SQL e fragil. Como o
 * agrupamento ja aconteceu no banco, sao poucas dezenas de linhas.
 */
export function dobrarComparacoes(linhas: LinhaComparacao[]): Comparacoes {
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

  return { seguiu, divergiu, liberadas };
}

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
 * Percentagem e motivo, a partir dos contadores.
 *
 * Compartilhado entre o alinhamento geral e o por tema de propósito: os dois
 * precisam decidir "publica a taxa?" com a mesma regra, senão um tema exibiria
 * percentagem sob um piso que o total esconde.
 */
export function resumirAlinhamento(
  comparacoes: Comparacoes,
  bancadaNaoResolvida: number,
  minimoParaTaxa: number,
): { taxa: number | null; motivo: MotivoSemTaxa | null; consideradas: number } {
  const consideradas = comparacoes.seguiu + comparacoes.divergiu;
  const temAmostra = consideradas >= minimoParaTaxa;

  return {
    consideradas,
    // A taxa só é publicada com amostra suficiente. Os contadores vêm sempre,
    // para a interface poder mostrar "N votações comparadas" em vez de uma
    // percentagem que não significa nada.
    taxa: temAmostra
      ? Number(((comparacoes.seguiu / consideradas) * 100).toFixed(1))
      : null,
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
  };
}

/** Quem não tem orientação de bancada coletada pelo agregador. */
export const ehSenador = (cargo?: string | null) =>
  normalizar(cargo).startsWith('senador');

/**
 * Formato uniforme de propósito: os contadores vêm sempre, e `taxa: null` com
 * `motivo` preenchido cobre os casos em que a percentagem não deve ser
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
   * declarado em vez de silencioso.
   */
  bancadaNaoResolvida: number;
  minimoParaTaxa: number;
  fonteFiliacao: 'historico' | 'partidoAtual' | null;
};

export class AlignmentService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * `filtros` existe para o alinhamento poder ser lido sob o mesmo recorte de
   * objeto que o resto: comparar uma taxa apurada so em votacoes de merito com
   * outra que inclui requerimento de urgencia e comparar populacoes diferentes.
   */
  async getAlignmentByParliamentarianId(
    parliamentarianId: number,
    filtros: FiltroObjeto = {},
  ): Promise<Alinhamento> {
    const [parliamentarian, filiacoes] = await Promise.all([
      this.prisma.parliamentarian.findUnique({
        where: { id: parliamentarianId },
        select: { role: true },
      }),
      this.prisma.partyAffiliation.count({ where: { parliamentarianId } }),
    ]);

    if (ehSenador(parliamentarian?.role)) {
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

    const filtro = condicaoDoFiltro(filtros, COLUNA_RESUMO);

    const [linhas, naoResolvidas] = await Promise.all([
      // Agregacao em SQL: o resultado tem, no maximo, algumas dezenas de linhas
      // (orientacao x voto), em vez de trazer todos os votos para a memoria.
      this.prisma.$queryRaw<LinhaComparacao[]>`
        SELECT o.orientacao AS orientacao,
               v.votoRegistrado AS voto,
               COUNT(*) AS total
        FROM voto v
        JOIN votacao va    ON va.idVotacao = v.idVotacao
        JOIN parlamentar p ON p.idParlamentar = v.idParlamentar
        JOIN orientacaoVotacao o
          ON o.idOrientacaoVotacao = ${ORIENTACAO_DA_BANCADA}
        WHERE v.idParlamentar = ${parliamentarianId}
          AND va.dataHora IS NOT NULL
          AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
          ${filtro}
        GROUP BY o.orientacao, v.votoRegistrado
      `,
      // Votacoes com orientacao publicada em que nenhuma bancada representa o
      // partido do parlamentar. Sem este contador, um deputado sem bancada
      // propria fica indistinguivel de um sem dado nenhum.
      this.prisma.$queryRaw<{ total: bigint | number }[]>`
        SELECT COUNT(*) AS total
        FROM voto v
        JOIN votacao va    ON va.idVotacao = v.idVotacao
        JOIN parlamentar p ON p.idParlamentar = v.idParlamentar
        WHERE v.idParlamentar = ${parliamentarianId}
          AND va.dataHora IS NOT NULL
          AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
          AND ${BANCADA_NAO_RESOLVIDA_SQL}
          ${filtro}
      `,
    ]);

    const bancadaNaoResolvida = Number(naoResolvidas[0]?.total ?? 0);
    const comparacoes = dobrarComparacoes(linhas);
    const { taxa, motivo, consideradas } = resumirAlinhamento(
      comparacoes,
      bancadaNaoResolvida,
      MINIMO_PARA_TAXA,
    );

    return {
      disponivel: true,
      taxa,
      motivo,
      seguiu: comparacoes.seguiu,
      divergiu: comparacoes.divergiu,
      consideradas,
      liberadas: comparacoes.liberadas,
      bancadaNaoResolvida,
      minimoParaTaxa: MINIMO_PARA_TAXA,
      fonteFiliacao: filiacoes > 0 ? 'historico' : 'partidoAtual',
    };
  }
}
