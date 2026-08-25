import { Prisma, PrismaClient } from '@prisma/client';
import { InvalidParameterError } from '../errors/http-errors';
import { cargoDaCasa } from '../lib/casas';
import { buildMeta, Pagination, TAMANHO_PAGINA_PADRAO } from '../lib/request-params';
import { formatarValor, paraDecimal } from '../domain/agrupamento-emendas';
import { CacheTtl } from '../lib/cache';
import { toNumber } from '../lib/metricas';

/**
 * "Que parlamentar mais se parece com o que eu procuro?"
 *
 * O QUE ESTE RANKING MEDE — E O QUE ELE NAO MEDE
 *
 * Ele mede ATUACAO: quem propoe sobre o tema, quem destina emenda para aquela
 * area ou para aquele municipio, quem senta na comissao. Nao mede CONCORDANCIA:
 * o usuario informa um assunto, nao uma posicao, entao "atua em Meio Ambiente"
 * inclui tanto quem defende quanto quem ataca a pauta ambiental.
 *
 * Isso e uma limitacao do dado, nao da implementacao — e por isso viaja no
 * `metadata.observacao` de toda resposta. Uma interface que rotular isto como
 * "quem mais concorda com voce" estara afirmando o que o dado nao sustenta.
 *
 * COMO A NOTA E CALCULADA
 *
 * 1. o pool e recortado pelos FILTROS (`partido`, `casa`, `uf`) — que incluem
 *    ou excluem, e nao pontuam;
 * 2. cada CRITERIO pedido produz um valor bruto por parlamentar;
 * 3. o valor vira 0-100 dividindo pelo MAIOR valor do pool — o primeiro
 *    colocado de cada criterio marca 100 por construcao;
 * 4. a nota final e a media dos criterios pedidos, com pesos opcionais.
 *
 * Duas consequencias declaradas de proposito:
 *
 *  - a nota e RELATIVA ao pool, nao absoluta. Trocar o filtro de partido muda
 *    todas as notas, porque muda o denominador. Por isso o valor bruto vem
 *    junto de cada criterio: e ele que da para auditar;
 *  - criterio sem sinal conta ZERO, e nao "ignorado". Quem atende um criterio
 *    de tres nao pode empatar com quem atende os tres — mas `criteriosAtendidos`
 *    vem no item para a interface poder dizer "atende 2 de 3".
 */

/** Criterios que pontuam. Filtros (`partido`, `casa`, `uf`) nao entram aqui. */
export const CRITERIOS = ['tema', 'funcaoEmenda', 'destinoEmenda', 'comissao'] as const;

export type Criterio = (typeof CRITERIOS)[number];

/** Unidade do valor bruto — o cliente precisa saber o que esta exibindo. */
const UNIDADE: Record<Criterio, string> = {
  tema: 'proposicoes',
  funcaoEmenda: 'reais_empenhados',
  destinoEmenda: 'reais_empenhados',
  comissao: 'participacao',
};

/** Criterios cujo valor bruto e dinheiro e sai como string decimal. */
const MONETARIOS = new Set<Criterio>(['funcaoEmenda', 'destinoEmenda']);

export type RankingFiltros = {
  tema?: string;
  funcaoEmenda?: string;
  destinoEmenda?: string;
  comissao?: string;
  partido?: string;
  casa?: string;
  uf?: string;
  /** Peso por criterio; ausente vale 1. */
  pesos?: Partial<Record<Criterio, number>>;
};

type LinhaValor = { id: number; valor: unknown; detalhe?: string | null };

type LinhaOpcao = { valor: string; total: bigint | number };

type LinhaComissao = {
  sigla: string | null;
  nome: string | null;
  casa: string;
  total: bigint | number;
};

/** Teto de destinos devolvidos: ha um por municipio atendido. */
const MAX_DESTINOS = 500;

type Candidato = {
  id: number;
  ballotName: string | null;
  currentParty: string | null;
  state: string | null;
  photoUrl: string | null;
  role: string | null;
};

export class RankingService {
  /**
   * Os dominios so mudam quando o ETL roda. O cache guarda a PROMESSA, entao
   * uma rajada com cache frio faz uma consulta so em vez de N.
   */
  private readonly cacheOpcoes = new CacheTtl({ maxEntradas: 2 });

  constructor(private readonly prisma: PrismaClient) {}

  async rankParliamentarians(
    filtros: RankingFiltros,
    pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO },
  ) {
    const pedidos = CRITERIOS.filter((criterio) => filtros[criterio]);

    // Sem criterio nao ha ranking: devolver "todos os parlamentares" numa
    // ordem qualquer, sob um campo chamado `pontuacao`, seria inventar um
    // numero. Filtro sozinho recorta, mas nao ordena.
    if (pedidos.length === 0) {
      throw new InvalidParameterError(
        'criterio',
        `Informe ao menos um critério de ranking: ${CRITERIOS.join(', ')}. ` +
          'Filtros (partido, casa, uf) recortam o resultado, mas não definem uma ordem.',
      );
    }

    const candidatos = await this.prisma.parliamentarian.findMany({
      where: this.buildWhere(filtros),
      select: {
        id: true,
        ballotName: true,
        currentParty: true,
        state: true,
        photoUrl: true,
        role: true,
      },
    });

    const noPool = new Map(candidatos.map((candidato) => [candidato.id, candidato]));

    const valoresPorCriterio = new Map<Criterio, Map<number, LinhaValor>>();

    await Promise.all(
      pedidos.map(async (criterio) => {
        const linhas = await this.valoresDo(criterio, filtros[criterio] as string);

        valoresPorCriterio.set(
          criterio,
          // Recorta pelo pool AQUI, e nao no SQL: o `IN` com centenas de ids
          // seria pior, e a agregacao ja devolve no maximo uma linha por
          // parlamentar.
          new Map(linhas.filter((linha) => noPool.has(linha.id)).map((l) => [l.id, l])),
        );
      }),
    );

    const maximos = new Map<Criterio, Prisma.Decimal>();

    for (const criterio of pedidos) {
      const valores = [...(valoresPorCriterio.get(criterio)?.values() ?? [])];

      maximos.set(
        criterio,
        valores.reduce(
          (maior, linha) => {
            const atual = paraDecimal(linha.valor);
            return atual.greaterThan(maior) ? atual : maior;
          },
          new Prisma.Decimal(0),
        ),
      );
    }

    const itens = candidatos
      .map((candidato) => this.pontuar(candidato, pedidos, valoresPorCriterio, maximos, filtros))
      // Sem sinal nenhum nao ha o que rankear: entrar com nota 0 so encheria a
      // lista de gente que nao tem relacao com o que foi pedido.
      .filter((item) => item.criteriosAtendidos > 0)
      .sort(
        (a, b) =>
          b.pontuacao - a.pontuacao ||
          b.criteriosAtendidos - a.criteriosAtendidos ||
          (a.nomeParlamentar ?? '').localeCompare(b.nomeParlamentar ?? '', 'pt-BR'),
      );

    const { page, limit } = pagination;
    const semResultado = pedidos.filter((criterio) =>
      (maximos.get(criterio) ?? new Prisma.Decimal(0)).isZero(),
    );

    return {
      data: itens.slice((page - 1) * limit, page * limit),
      meta: buildMeta(itens.length, page, limit),
      metadata: {
        criterios: pedidos.map((criterio) => ({
          criterio,
          valorPedido: filtros[criterio],
          unidade: UNIDADE[criterio],
          peso: filtros.pesos?.[criterio] ?? 1,
          /** O denominador da normalização — é o que torna a nota auditável. */
          maiorValorNoPool: this.formatar(criterio, maximos.get(criterio)),
        })),
        filtros: {
          partido: filtros.partido ?? null,
          casa: filtros.casa ?? null,
          uf: filtros.uf ?? null,
        },
        // Quem passou nos filtros vs. quem tem alguma relação com o pedido.
        candidatos: candidatos.length,
        comAlgumSinal: itens.length,
        criteriosSemResultado: semResultado,
        metodo:
          'Cada critério vira 0-100 dividindo o valor do parlamentar pelo maior valor entre os candidatos; ' +
          'a nota final é a média ponderada dos critérios pedidos. Critério sem sinal conta 0, não é ignorado.',
        observacao:
          'Este ranking mede ATUAÇÃO, não concordância. O usuário informa um assunto, não uma posição: ' +
          '"atua em Meio Ambiente" inclui tanto quem defende quanto quem se opõe à pauta ambiental. ' +
          'Não rotule o resultado como "quem mais concorda com você". ' +
          'A nota é relativa ao conjunto filtrado — mudar o filtro de partido muda todas as notas, ' +
          'porque muda o denominador; use os valores brutos de cada critério para comparar entre buscas.',
      },
    };
  }

  private pontuar(
    candidato: Candidato,
    pedidos: Criterio[],
    valoresPorCriterio: Map<Criterio, Map<number, LinhaValor>>,
    maximos: Map<Criterio, Prisma.Decimal>,
    filtros: RankingFiltros,
  ) {
    let somaPonderada = 0;
    let somaPesos = 0;
    let criteriosAtendidos = 0;

    const criterios: Record<string, unknown> = {};

    for (const criterio of pedidos) {
      const linha = valoresPorCriterio.get(criterio)?.get(candidato.id);
      const valor = paraDecimal(linha?.valor);
      const maximo = maximos.get(criterio) ?? new Prisma.Decimal(0);
      const peso = filtros.pesos?.[criterio] ?? 1;

      // Máximo zero significa que ninguém no pool pontuou neste critério. Ele
      // não pode virar 100 para todo mundo nem quebrar a divisão.
      const pontuacao = maximo.isZero()
        ? 0
        : Number(valor.dividedBy(maximo).times(100).toFixed(1));

      if (valor.greaterThan(0)) {
        criteriosAtendidos += 1;
      }

      somaPonderada += pontuacao * peso;
      somaPesos += peso;

      criterios[criterio] = {
        pedido: filtros[criterio],
        valor: this.formatar(criterio, valor),
        unidade: UNIDADE[criterio],
        pontuacao,
        ...(linha?.detalhe ? { detalhe: linha.detalhe } : {}),
      };
    }

    return {
      id: candidato.id,
      nomeParlamentar: candidato.ballotName ?? '',
      siglaPartido: candidato.currentParty ?? '',
      uf: candidato.state ?? '',
      urlFoto: candidato.photoUrl ?? '',
      cargo: candidato.role ?? '',
      pontuacao: somaPesos === 0 ? 0 : Number((somaPonderada / somaPesos).toFixed(1)),
      /** Quantos dos critérios pedidos ele atende de fato — "2 de 3". */
      criteriosAtendidos,
      criteriosPedidos: pedidos.length,
      criterios,
    };
  }

  /** Dinheiro sai como string decimal; contagem e participação, como número. */
  private formatar(criterio: Criterio, valor?: Prisma.Decimal) {
    const decimal = valor ?? new Prisma.Decimal(0);

    return MONETARIOS.has(criterio) ? formatarValor(decimal) : decimal.toNumber();
  }

  private buildWhere(filtros: RankingFiltros): Prisma.ParliamentarianWhereInput {
    const where: Prisma.ParliamentarianWhereInput = {};

    if (filtros.partido) {
      where.currentParty = filtros.partido.toUpperCase();
    }

    if (filtros.uf) {
      where.state = filtros.uf.toUpperCase();
    }

    // `cargoDaCasa` lança 400 para casa desconhecida, em vez de devolver lista
    // vazia como se ninguém atendesse.
    if (filtros.casa) {
      where.role = cargoDaCasa(filtros.casa);
    }

    return where;
  }

  /**
   * Uma agregação por critério, no banco.
   *
   * `groupBy` do Prisma não serve nos dois de emenda: a soma é de uma coluna da
   * tabela relacionada (`emenda`), não da tabela agrupada — a mesma razão pela
   * qual `DashboardService` usa SQL cru.
   *
   * As comparações são por igualdade, e não por `LIKE`: a collation é
   * `utf8mb4_unicode_ci`, então "saude" já encontra "Saúde" sem o risco de
   * substring que `LIKE '%x%'` traria ("Saúde" casaria dentro de outra coisa).
   */
  private valoresDo(criterio: Criterio, valor: string): Promise<LinhaValor[]> {
    if (criterio === 'tema') {
      return this.prisma.$queryRaw<LinhaValor[]>`
        SELECT ap.idParlamentar AS id,
               COUNT(DISTINCT ap.idProposicao) AS valor
        FROM autoriaProposicao ap
        JOIN temaProposicao tp ON tp.idProposicao = ap.idProposicao
        JOIN tema t            ON t.idTema = tp.idTema
        WHERE t.descricao = ${valor}
        GROUP BY ap.idParlamentar
      `;
    }

    if (criterio === 'comissao') {
      // Aceita nome ou sigla porque o cliente tem os dois em mãos e exigir um
      // deles seria uma pegadinha. `cargo` volta como detalhe: ser presidente
      // e ser suplente não são a mesma coisa, e o dado não permite pesá-los
      // sem chutar as redações que o ETL grava.
      return this.prisma.$queryRaw<LinhaValor[]>`
        SELECT mo.idParlamentar AS id,
               1 AS valor,
               GROUP_CONCAT(DISTINCT mo.cargo ORDER BY mo.cargo SEPARATOR ', ') AS detalhe
        FROM membroOrgao mo
        JOIN orgao o ON o.idOrgao = mo.idOrgao
        WHERE o.nome = ${valor} OR o.sigla = ${valor}
        GROUP BY mo.idParlamentar
      `;
    }

    const coluna =
      criterio === 'funcaoEmenda' ? Prisma.sql`e.funcao` : Prisma.sql`e.localidadeDoGasto`;

    return this.prisma.$queryRaw<LinhaValor[]>`
      SELECT ep.idParlamentar AS id,
             COALESCE(SUM(e.valorEmpenhado), 0) AS valor
      FROM emendaParlamentar ep
      JOIN emenda e ON e.idEmenda = ep.idEmenda
      WHERE ${coluna} = ${valor}
      GROUP BY ep.idParlamentar
    `;
  }
  /**
   * Dominios validos para montar o formulario.
   *
   * Existe porque os criterios comparam por IGUALDADE: um valor digitado a mao
   * que nao case exatamente devolve lista vazia, e o usuario nao teria como
   * distinguir "ninguem atua nisso" de "escrevi errado".
   *
   * As opcoes sao globais, nao facetadas pela busca corrente — facetar custaria
   * uma consulta por dimensao a cada requisicao, e este e um banco pequeno numa
   * maquina fraca.
   */
  async listRankingOptions() {
    return this.cacheOpcoes.resolver('ranking:opcoes', () => this.carregarOpcoes());
  }

  private async carregarOpcoes() {
    const [temas, funcoes, destinos, partidos, comissoes] = await Promise.all([
      this.prisma.$queryRaw<LinhaOpcao[]>`
        SELECT t.descricao AS valor, COUNT(DISTINCT tp.idProposicao) AS total
        FROM tema t
        JOIN temaProposicao tp ON tp.idTema = t.idTema
        GROUP BY t.descricao
        ORDER BY total DESC, t.descricao ASC
      `,
      this.prisma.$queryRaw<LinhaOpcao[]>`
        SELECT e.funcao AS valor, COUNT(*) AS total
        FROM emenda e
        WHERE e.funcao IS NOT NULL AND e.funcao <> ''
        GROUP BY e.funcao
        ORDER BY total DESC, e.funcao ASC
      `,
      // Localidade e a unica dimensao grande: ha um destino por municipio
      // atendido. O corte vai declarado em `metadata`, porque uma lista
      // truncada em silencio parece o dominio completo.
      this.prisma.$queryRaw<LinhaOpcao[]>`
        SELECT e.localidadeDoGasto AS valor, COUNT(*) AS total
        FROM emenda e
        WHERE e.localidadeDoGasto IS NOT NULL AND e.localidadeDoGasto <> ''
        GROUP BY e.localidadeDoGasto
        ORDER BY total DESC, e.localidadeDoGasto ASC
        LIMIT ${Prisma.raw(String(MAX_DESTINOS))}
      `,
      this.prisma.$queryRaw<LinhaOpcao[]>`
        SELECT p.partidoAtual AS valor, COUNT(*) AS total
        FROM parlamentar p
        WHERE p.partidoAtual IS NOT NULL AND p.partidoAtual <> ''
        GROUP BY p.partidoAtual
        ORDER BY p.partidoAtual ASC
      `,
      this.prisma.$queryRaw<LinhaComissao[]>`
        SELECT o.sigla AS sigla, o.nome AS nome, o.casa AS casa,
               COUNT(mo.idMembroOrgao) AS total
        FROM orgao o
        JOIN membroOrgao mo ON mo.idOrgao = o.idOrgao
        GROUP BY o.idOrgao, o.sigla, o.nome, o.casa
        ORDER BY total DESC, o.nome ASC
      `,
    ]);

    const opcoes = (linhas: LinhaOpcao[]) =>
      linhas.map((linha) => ({ valor: linha.valor, total: toNumber(linha.total) }));

    return {
      temas: opcoes(temas),
      funcoesEmenda: opcoes(funcoes),
      destinosEmenda: opcoes(destinos),
      partidos: opcoes(partidos),
      comissoes: comissoes.map((linha) => ({
        sigla: linha.sigla,
        nome: linha.nome,
        casa: linha.casa,
        membros: toNumber(linha.total),
      })),
      metadata: {
        destinosTruncadosEm: MAX_DESTINOS,
        observacao:
          'Os critérios comparam por igualdade — use os valores desta rota, não texto digitado. ' +
          'A comparação ignora caixa e acento (collation utf8mb4_unicode_ci). ' +
          `destinosEmenda vem ordenado por número de emendas e cortado em ${MAX_DESTINOS}: ` +
          'há um destino por município atendido, e a cauda não cabe num seletor. ' +
          'comissao aceita a sigla ou o nome.',
      },
    };
  }

}
