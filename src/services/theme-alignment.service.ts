import { Prisma, PrismaClient } from '@prisma/client';
import {
  condicaoDoFiltro,
  FiltroObjeto,
  OBJETOS_DE_MERITO,
} from '../domain/objeto-votacao';
import { toNumber } from '../lib/metricas';
import {
  Alinhamento,
  AlignmentService,
  BANCADA_NAO_RESOLVIDA_SQL,
  Comparacoes,
  dobrarComparacoes,
  LinhaComparacao,
  MotivoSemTaxa,
  ORIENTACAO_DA_BANCADA,
  resumirAlinhamento,
} from './alignment.service';

/**
 * Fidelidade partidária **por tema da proposição votada**.
 *
 * A taxa geral responde "87%" e para por aí. A pergunta que interessa a quem
 * fiscaliza é onde esses 13% de divergência estão: um deputado que acompanha o
 * partido em tudo menos em meio ambiente é um fato político; a média esconde
 * exatamente isso.
 *
 * Reaproveita as regras do `AlignmentService` — resolução da bancada, partido
 * na data da votação, "Liberado"/"Artigo 17" fora do denominador — em vez de
 * reescrevê-las. Duas definições da mesma comparação divergiriam na primeira
 * manutenção, e o total deixaria de conversar com as partes.
 *
 * Três coisas que o payload declara em vez de deixar implícitas:
 *
 *  1. **A soma dos temas não é o total.** Uma proposição pode ter vários temas
 *     e o voto conta em cada um. Somar a lista dá um número maior que
 *     `geral.consideradas`, e maior que a realidade.
 *  2. **Nem todo voto tem tema.** Votação sem proposição vinculada
 *     (requerimento, questão de ordem) e proposição sem tema registrado ficam
 *     fora — contadas em `excluidos`, não silenciadas.
 *  3. **O piso da taxa por tema é menor que o geral.** Ver `MINIMO_POR_TEMA`.
 */

/** Temas devolvidos, quando o cliente não pede outro valor. */
const LIMITE_PADRAO = 10;

/**
 * Piso de comparações para publicar a taxa **de um tema**.
 *
 * Menor que o `MINIMO_PARA_TAXA` global (20) por uma razão prática: o tema é um
 * recorte do mesmo conjunto de votos, então exigir o piso do total esconderia
 * quase todos os temas de quase todo mundo — e o endpoint não serviria para
 * nada. Dez comparações ainda são poucas: uma divergência move a percentagem
 * em dez pontos. Por isso `consideradas` vem sempre, e a interface deve
 * preferir "31 de 34 votações" a "91,2%" quando o número for baixo.
 *
 * É um julgamento, não uma medida — daí estar no payload, em `minimoParaTaxa`.
 */
export const MINIMO_POR_TEMA = 10;

const COLUNA_RESUMO = Prisma.sql`va.resumoMateria`;

type LinhaTema = LinhaComparacao & { tema: string };

type LinhaContagemTema = { tema: string; total: bigint | number };

type Contagem = { total: bigint | number };

export type AlinhamentoDoTema = {
  tema: string;
  taxa: number | null;
  motivo: MotivoSemTaxa | null;
  seguiu: number;
  divergiu: number;
  consideradas: number;
  liberadas: number;
  bancadaNaoResolvida: number;
  minimoParaTaxa: number;
};

export class ThemeAlignmentService {
  private readonly alignmentService: AlignmentService;

  constructor(private readonly prisma: PrismaClient) {
    this.alignmentService = new AlignmentService(prisma);
  }

  async getThemeAlignment(
    parliamentarianId: number,
    limite = LIMITE_PADRAO,
    filtros: FiltroObjeto = {},
  ) {
    // O mesmo recorte do resto do payload: um `geral` sem filtro somaria
    // requerimento de urgencia numa lista que so conta merito, e o contraste
    // entre os dois numeros deixaria de significar alguma coisa.
    const geral = await this.alignmentService.getAlignmentByParliamentarianId(
      parliamentarianId,
      filtros,
    );

    // Senador: o agregador não coleta orientação de bancada. Sem fonte, não há
    // recorte por tema a fazer — e devolver uma lista vazia sem dizer o motivo
    // seria indistinguível de "ele nunca divergiu".
    if (!geral.disponivel) {
      return this.montarResposta(geral, [], { semProposicao: 0, semTema: 0 }, limite, filtros);
    }

    const filtro = condicaoDoFiltro(filtros, COLUNA_RESUMO);

    const [linhas, naoResolvidas, excluidos] = await Promise.all([
      this.comparacoesPorTema(parliamentarianId, filtro),
      this.naoResolvidasPorTema(parliamentarianId, filtro),
      this.excluidos(parliamentarianId, filtro),
    ]);

    return this.montarResposta(
      geral,
      this.consolidar(linhas, naoResolvidas),
      excluidos,
      limite,
      filtros,
    );
  }

  /**
   * Uma linha por (tema, orientação, voto).
   *
   * Sem `LIMIT`: o ranking tem de acontecer depois da dobra, porque
   * `consideradas` exclui as liberadas — ordenar por `COUNT(*)` no banco
   * classificaria os temas por uma quantidade diferente da que a lista publica.
   * O resultado é limitado por construção (temas × ~6 orientações × 4 votos).
   */
  private comparacoesPorTema(parliamentarianId: number, filtro: Prisma.Sql) {
    return this.prisma.$queryRaw<LinhaTema[]>`
      SELECT t.descricao AS tema,
             o.orientacao AS orientacao,
             v.votoRegistrado AS voto,
             COUNT(*) AS total
      FROM voto v
      JOIN votacao va        ON va.idVotacao = v.idVotacao
      JOIN parlamentar p     ON p.idParlamentar = v.idParlamentar
      JOIN temaProposicao tp ON tp.idProposicao = va.idProposicao
      JOIN tema t            ON t.idTema = tp.idTema
      JOIN orientacaoVotacao o
        ON o.idOrientacaoVotacao = ${ORIENTACAO_DA_BANCADA}
      WHERE v.idParlamentar = ${parliamentarianId}
        AND va.dataHora IS NOT NULL
        AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
        ${filtro}
      GROUP BY t.descricao, o.orientacao, v.votoRegistrado
    `;
  }

  /**
   * Votos do tema com orientação publicada em que nenhuma bancada representava
   * o partido. Um tema que só aparece aqui continua na lista: "o partido dele
   * nunca orientou nestas votações" é resposta, e some se for filtrado.
   */
  private naoResolvidasPorTema(parliamentarianId: number, filtro: Prisma.Sql) {
    return this.prisma.$queryRaw<LinhaContagemTema[]>`
      SELECT t.descricao AS tema, COUNT(*) AS total
      FROM voto v
      JOIN votacao va        ON va.idVotacao = v.idVotacao
      JOIN parlamentar p     ON p.idParlamentar = v.idParlamentar
      JOIN temaProposicao tp ON tp.idProposicao = va.idProposicao
      JOIN tema t            ON t.idTema = tp.idTema
      WHERE v.idParlamentar = ${parliamentarianId}
        AND va.dataHora IS NOT NULL
        AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
        AND ${BANCADA_NAO_RESOLVIDA_SQL}
        ${filtro}
      GROUP BY t.descricao
    `;
  }

  /**
   * O que a lista por tema não mostra: votos comparáveis que nenhum tema
   * classifica. Mesmo recorte da consulta principal, menos o `JOIN` de tema —
   * se os filtros divergissem, os números parariam de fechar.
   */
  private async excluidos(parliamentarianId: number, filtro: Prisma.Sql) {
    const [semProposicao, semTema] = await Promise.all([
      this.prisma.$queryRaw<Contagem[]>`
        SELECT COUNT(*) AS total
        FROM voto v
        JOIN votacao va ON va.idVotacao = v.idVotacao
        WHERE v.idParlamentar = ${parliamentarianId}
          AND va.dataHora IS NOT NULL
          AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
          AND va.idProposicao IS NULL
          ${filtro}
      `,
      this.prisma.$queryRaw<Contagem[]>`
        SELECT COUNT(*) AS total
        FROM voto v
        JOIN votacao va ON va.idVotacao = v.idVotacao
        WHERE v.idParlamentar = ${parliamentarianId}
          AND va.dataHora IS NOT NULL
          AND v.votoRegistrado IN ('SIM','NAO','ABSTENCAO','OBSTRUCAO')
          AND va.idProposicao IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM temaProposicao tp WHERE tp.idProposicao = va.idProposicao
          )
          ${filtro}
      `,
    ]);

    return {
      semProposicao: toNumber(semProposicao[0]?.total),
      semTema: toNumber(semTema[0]?.total),
    };
  }

  /** Agrupa as linhas por tema e aplica a mesma dobra do alinhamento geral. */
  private consolidar(
    linhas: LinhaTema[],
    naoResolvidas: LinhaContagemTema[],
  ): AlinhamentoDoTema[] {
    const porTema = new Map<string, LinhaComparacao[]>();

    for (const linha of linhas) {
      const atual = porTema.get(linha.tema) ?? [];
      atual.push(linha);
      porTema.set(linha.tema, atual);
    }

    const pendentes = new Map<string, number>();

    for (const linha of naoResolvidas) {
      pendentes.set(linha.tema, toNumber(linha.total));

      if (!porTema.has(linha.tema)) {
        porTema.set(linha.tema, []);
      }
    }

    const temas: AlinhamentoDoTema[] = [];

    porTema.forEach((linhasDoTema, tema) => {
      const comparacoes: Comparacoes = dobrarComparacoes(linhasDoTema);
      const bancadaNaoResolvida = pendentes.get(tema) ?? 0;
      const { taxa, motivo, consideradas } = resumirAlinhamento(
        comparacoes,
        bancadaNaoResolvida,
        MINIMO_POR_TEMA,
      );

      temas.push({
        tema,
        taxa,
        motivo,
        seguiu: comparacoes.seguiu,
        divergiu: comparacoes.divergiu,
        consideradas,
        liberadas: comparacoes.liberadas,
        bancadaNaoResolvida,
        minimoParaTaxa: MINIMO_POR_TEMA,
      });
    });

    // Por evidência, não por taxa: um tema com 3 comparações e 100% não deve
    // encabeçar a lista de um com 60 comparações e 88%.
    return temas.sort(
      (a, b) =>
        b.consideradas - a.consideradas || a.tema.localeCompare(b.tema, 'pt-BR'),
    );
  }

  private montarResposta(
    geral: Alinhamento,
    temas: AlinhamentoDoTema[],
    excluidos: { semProposicao: number; semTema: number },
    limite: number,
    filtros: FiltroObjeto,
  ) {
    const limiteEfetivo = Math.max(1, Math.trunc(limite));

    return {
      disponivel: geral.disponivel,
      // O total vem junto para a interface poder contrastar "88% no geral" com
      // "61% em meio ambiente" sem uma segunda requisição — que é a leitura
      // inteira deste endpoint.
      geral,
      temas: temas.slice(0, limiteEfetivo),
      excluidos: {
        votosSemProposicao: excluidos.semProposicao,
        votosEmProposicaoSemTema: excluidos.semTema,
      },
      metadata: {
        limite: limiteEfetivo,
        temasComparados: temas.length,
        minimoParaTaxa: MINIMO_POR_TEMA,
        minimoParaTaxaGeral: geral.minimoParaTaxa,
        ordenacao: 'consideradas DESC, tema ASC',
        /** `geral` responde ao mesmo `filtro` — os dois numeros sao comparaveis. */
        filtroAplicadoAoGeral: true,
        agrupamento: 'tema.descricao',
        filtro: {
          objeto: filtros.objeto ?? null,
          apenasMerito: Boolean(filtros.apenasMerito),
          objetosDeMerito: OBJETOS_DE_MERITO,
        },
        observacao:
          'Uma proposição pode ter vários temas e o voto conta em cada um — a soma dos temas é maior que geral.consideradas. ' +
          'A lista é ordenada por número de comparações, não por taxa: o topo é onde há mais evidência, não onde a fidelidade é maior. ' +
          `Abaixo de ${MINIMO_POR_TEMA} comparações a taxa vem nula com motivo AMOSTRA_INSUFICIENTE; ` +
          'prefira exibir consideradas a arredondar uma percentagem que uma única divergência move. ' +
          'Temas da Câmara e do Senado são agrupados apenas quando a descrição é idêntica.',
        exclusoes: [
          'votos em votações sem proposição vinculada (requerimentos, questões de ordem)',
          'votos em proposições sem tema registrado',
          'ausências e voto não registrado (não há voto a comparar)',
          'votos com orientação "Liberado"/"Artigo 17" (contados em liberadas, fora do denominador)',
          ...(filtros.objeto || filtros.apenasMerito
            ? ['votações fora do recorte de objeto pedido']
            : []),
        ],
      },
    };
  }
}
