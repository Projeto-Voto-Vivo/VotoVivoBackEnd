import { Prisma, PrismaClient, VoteChoice } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { casaLegislativa } from '../lib/casas';
import { montarPlacar, Placar, totalDoPlacar } from '../domain/placar';
import { CacheTtl, chaveDeFiltros } from '../lib/cache';
import {
  buildMeta,
  buildMetaSemContagem,
  Pagination,
  TAMANHO_PAGINA_PADRAO,
} from '../lib/request-params';

type PropositionRef = {
  id: number;
  house: string | null;
  number: string | null;
  year: number | null;
  propositionType: { sigla: string | null } | null;
};

export type PropositionFilters = {
  /** Sigla do tipo (`PL`, `PEC`, `MPV`...). */
  tipo?: string;
  ano?: number;
  /** Casa de origem da proposição. */
  casa?: string;
  /**
   * `proposicao.statusAtual` é texto livre vindo das APIs da Câmara e do
   * Senado, com dezenas de redações. Match por substring é o que torna o
   * filtro usável; os valores reais saem de `listFilterOptions`.
   */
  situacao?: string;
  /** Descrição exata do tema, como devolvida por `listFilterOptions`. */
  tema?: string;
  /** Busca textual em ementa e número da proposição. */
  busca?: string;
  /** Id interno do parlamentar autor (via `autoriaProposicao`). */
  autor?: number;
};

/** Teto de situações distintas devolvidas em `/proposicoes/filtros`. */
const MAX_SITUACOES = 100;

export class PropositionService {
  /**
   * Contagens e domínios de filtro só mudam quando o ETL roda. O cache guarda a
   * *promessa*, então uma rajada de requisições idênticas com o cache frio faz
   * uma consulta só em vez de N — que é o padrão que derruba um MySQL pequeno.
   *
   * De instância, não de módulo: o router cria um serviço, então na prática é
   * um cache por processo — e cada teste começa com o cache limpo, sem estado
   * global vazando de um caso para o outro.
   */
  private readonly cachePaginas = new CacheTtl({ maxEntradas: 200 });
  private readonly cacheFiltros = new CacheTtl({ maxEntradas: 4 });

  constructor(private readonly prisma: PrismaClient) {}

  async listPropositions(
    pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO },
    filters: PropositionFilters = {},
    opcoes: { contarTotal?: boolean } = {},
  ) {
    // A pagina inteira entra no cache, nao so a contagem: o `findMany` com os
    // includes de tipo e tema gera varias consultas, e e ele que domina o custo.
    // Guardando o resultado completo, uma rajada de requisicoes identicas vira
    // uma ida ao banco em vez de uma por requisicao.
    return this.cachePaginas.resolver(
      chaveDeFiltros('proposicoes', { ...pagination, ...filters, ...opcoes }),
      () => this.carregarPropositions(pagination, filters, opcoes),
    );
  }

  private async carregarPropositions(
    pagination: Pagination,
    filters: PropositionFilters,
    opcoes: { contarTotal?: boolean },
  ) {
    const { page, limit } = pagination;
    const contarTotal = opcoes.contarTotal !== false;
    const where = this.buildWhere(filters);

    // Sem contagem, busca uma linha a mais só para saber se há próxima página —
    // custa praticamente nada e evita a segunda varredura da tabela.
    const take = contarTotal ? limit : limit + 1;

    const [encontradas, total] = await Promise.all([
      this.prisma.proposition.findMany({
        where,
        include: {
          propositionType: true,
          temaProposicao: { include: { tema: true } },
        },
        orderBy: [{ year: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take,
      }),
      contarTotal ? this.prisma.proposition.count({ where }) : Promise.resolve(null),
    ]);

    const temProximaPagina = contarTotal
      ? page * limit < (total ?? 0)
      : encontradas.length > limit;
    const propositions = contarTotal ? encontradas : encontradas.slice(0, limit);

    return {
      data: propositions.map((proposition) => ({
        id: proposition.id,
        casa: proposition.house,
        sigla: proposition.propositionType?.sigla ?? null,
        numero: proposition.number,
        ano: proposition.year,
        ementa: proposition.summary,
        situacao: proposition.currentStatus,
        dataApresentacao: toIsoDate(proposition.presentationDate),
        temas: proposition.temaProposicao.map((link) => link.tema.descricao),
      })),
      // `meta.total` reflete o filtro aplicado: é o que permite ao cliente
      // paginar de verdade em vez de baixar tudo e filtrar em memória.
      meta:
        total === null
          ? buildMetaSemContagem(page, limit, temProximaPagina)
          : buildMeta(total, page, limit),
      filtros: {
        tipo: filters.tipo ?? null,
        ano: filters.ano ?? null,
        casa: filters.casa ?? null,
        situacao: filters.situacao ?? null,
        tema: filters.tema ?? null,
        busca: filters.busca ?? null,
        autor: filters.autor ?? null,
      },
    };
  }

  /**
   * Domínios disponíveis para montar os filtros da UI.
   *
   * Existe por causa de `situacao`: sendo texto livre, o cliente não tem como
   * adivinhar as redações válidas — hardcodar geraria filtros que não casam
   * com nada. Os contadores permitem ordenar por relevância e esconder cauda.
   *
   * As opções são globais, não facetadas pelo filtro corrente: uma faceta que
   * se reduz a cada seleção esconde caminhos e custa uma query por dimensão a
   * cada request.
   */
  async listFilterOptions() {
    return this.cacheFiltros.resolver('proposicoes:filtros', () =>
      this.carregarFilterOptions(),
    );
  }

  /** Cinco agregações; é a rota mais cara por requisição da API. */
  private async carregarFilterOptions() {
    const [tipos, anos, situacoes, casas, temas] = await Promise.all([
      this.prisma.propositionType.findMany({
        select: { sigla: true, nome: true, casa: true },
        orderBy: [{ casa: 'asc' }, { sigla: 'asc' }],
      }),
      this.prisma.proposition.groupBy({
        by: ['year'],
        where: { year: { not: null } },
        _count: { _all: true },
        orderBy: { year: 'desc' },
      }),
      this.prisma.proposition.groupBy({
        by: ['currentStatus'],
        where: { currentStatus: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { currentStatus: 'desc' } },
        take: MAX_SITUACOES,
      }),
      this.prisma.proposition.groupBy({
        by: ['house'],
        where: { house: { not: null } },
        _count: { _all: true },
      }),
      // `tema` é uma tabela pequena (dezenas de linhas); o _count da relação
      // evita um groupBy com join, que o Prisma não expõe.
      this.prisma.tema.findMany({
        select: {
          idTema: true,
          descricao: true,
          casa: true,
          _count: { select: { temaProposicao: true } },
        },
        orderBy: [{ descricao: 'asc' }],
      }),
    ]);

    return {
      tipos: tipos.map((tipo) => ({
        sigla: tipo.sigla,
        nome: tipo.nome,
        casa: tipo.casa,
      })),
      anos: anos.map((ano) => ({ ano: ano.year, total: ano._count._all })),
      situacoes: situacoes.map((situacao) => ({
        situacao: situacao.currentStatus,
        total: situacao._count._all,
      })),
      casas: casas.map((casa) => ({ casa: casa.house, total: casa._count._all })),
      temas: temas
        // Temas sem nenhuma proposição virariam opções mortas no dropdown.
        .filter((tema) => tema._count.temaProposicao > 0)
        .map((tema) => ({
          id: tema.idTema,
          tema: tema.descricao,
          casa: tema.casa,
          total: tema._count.temaProposicao,
        })),
      metadata: {
        situacoesTruncadasEm: MAX_SITUACOES,
        observacao:
          'situacao vem de `proposicao.statusAtual`, texto livre das APIs da Câmara e do Senado. O filtro correspondente casa por substring.',
      },
    };
  }

  async getPropositionById(id: number) {
    const proposition = await this.prisma.proposition.findUnique({
      where: { id },
      include: {
        propositionType: true,
        temaProposicao: { include: { tema: true } },
        votings: { include: { orgao: true } },
        authors: { include: { parliamentarian: true } },
        relations: {
          include: { related: { include: { propositionType: true } } },
        },
      },
    });

    if (!proposition) {
      throw new NotFoundError('Proposição não encontrada.');
    }

    // Um unico groupBy para todas as votacoes da proposicao, em vez de uma
    // consulta por votacao.
    const placares = await this.placaresPorVotacao(
      proposition.votings.map((voting) => voting.id),
    );

    const relacionadas = proposition.relations;
    const porTipo = (tipo: string) =>
      relacionadas
        .filter((relacao) => relacao.relationType === tipo)
        .map((relacao) => referenciaProposicao(relacao.related));

    return {
      id: proposition.id,
      // Id na API de origem: e com ele que o cliente monta o link para a ficha
      // oficial da Camara ou do Senado.
      apiId: proposition.apiId,
      casa: proposition.house,
      sigla: proposition.propositionType?.sigla ?? null,
      numero: proposition.number,
      ano: proposition.year,
      ementa: proposition.summary,
      situacao: proposition.currentStatus,
      dataApresentacao: toIsoDate(proposition.presentationDate),
      temas: proposition.temaProposicao.map((link) => link.tema.descricao),
      // So autoria parlamentar: autoriaProposicao nao modela autor externo
      // (Executivo, Judiciario, comissao, iniciativa popular), entao uma lista
      // vazia aqui NAO significa "sem autor" — ver o bloco `autoria`.
      autores: proposition.authors.map((autoria) => ({
        id: autoria.parliamentarian.id,
        nomeParlamentar: autoria.parliamentarian.ballotName ?? '',
        siglaPartido: autoria.parliamentarian.currentParty ?? '',
        uf: autoria.parliamentarian.state ?? '',
        urlFoto: autoria.parliamentarian.photoUrl ?? '',
        cargo: autoria.parliamentarian.role,
      })),
      autoria: {
        somenteParlamentares: true,
        observacao:
          'O banco so registra autoria parlamentar. Proposicoes do Executivo, do Judiciario, de comissao ou de iniciativa popular ficam com autores vazio — ausencia de autor parlamentar, nao ausencia de autor.',
      },
      // Jornada bicameral: a mesma materia costuma existir nas duas casas com
      // ids diferentes; sem `proposicaoRelacao` elas apareciam desconexas.
      jornada: {
        mesmaMateria: porTipo('MESMA_MATERIA'),
        principal: porTipo('PRINCIPAL')[0] ?? null,
        anteriores: porTipo('ANTERIOR'),
        posteriores: porTipo('POSTERIOR'),
      },
      votacoes: proposition.votings.map((voting) => {
        const placar = placares.get(voting.id) ?? montarPlacar([]);

        return {
          id: voting.id,
          casa: voting.casa,
          data: voting.votingDate,
          resumo: voting.subjectSummary,
          resultado: voting.finalResult,
          tipo: voting.votingType,
          // Saber que a votacao foi na CCJC e nao no Plenario muda a leitura
          // do placar.
          orgao: referenciaOrgao(voting.orgao),
          placar,
          totalVotos: totalDoPlacar(placar),
        };
      }),
    };
  }

  /**
   * Historico de tramitacao.
   *
   * O orgao e o regime sao resolvidos por consulta separada, e nao por
   * `include`: `tramitacao.idOrgao` e `tramitacao.idTipoTramitacao` sao colunas
   * soltas no schema canonico — sem FOREIGN KEY. Declarar `@relation` no Prisma
   * faria o `npm run schema:check` acusar divergencia (o Prisma passaria a
   * exigir duas FKs que o banco nao tem) e um `db push` divergiria de producao
   * em silencio. A correcao de verdade e adicionar FK e indice no agregador;
   * ate la, o join acontece aqui, com o mesmo resultado e sem desvio de schema.
   */
  async listTramitacoes(
    propositionId: number,
    pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO },
  ) {
    await this.ensurePropositionExists(propositionId);

    const { page, limit } = pagination;
    const where = { idProposicao: propositionId };

    const [etapas, total] = await Promise.all([
      this.prisma.tramitacao.findMany({
        where,
        // `sequencia` e a ordem oficial; `dataHora` desempata e cobre as linhas
        // sem sequencia.
        orderBy: [{ sequencia: 'asc' }, { dataHora: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tramitacao.count({ where }),
    ]);

    const orgaoIds = unicos(etapas.map((etapa) => etapa.idOrgao));
    const tipoIds = unicos(etapas.map((etapa) => etapa.idTipoTramitacao));

    const [orgaos, tipos] = await Promise.all([
      orgaoIds.length
        ? this.prisma.orgao.findMany({ where: { idOrgao: { in: orgaoIds } } })
        : Promise.resolve([]),
      tipoIds.length
        ? this.prisma.tipoTramitacao.findMany({
            where: { idTipoTramitacao: { in: tipoIds } },
          })
        : Promise.resolve([]),
    ]);

    const porOrgao = new Map(orgaos.map((orgao) => [orgao.idOrgao, orgao]));
    const porTipo = new Map(tipos.map((tipo) => [tipo.idTipoTramitacao, tipo]));

    return {
      data: etapas.map((etapa) => {
        const tipo =
          etapa.idTipoTramitacao === null
            ? undefined
            : porTipo.get(etapa.idTipoTramitacao);

        return {
          id: etapa.idTramitacao,
          sequencia: etapa.sequencia,
          dataHora: etapa.dataHora,
          descricaoTramitacao: etapa.descricaoTramitacao,
          descricaoSituacao: etapa.descricaoSituacao,
          despacho: etapa.despacho,
          regime: tipo?.regime ?? null,
          tipoTramitacao: tipo?.descricao ?? null,
          orgao: referenciaOrgao(
            etapa.idOrgao === null ? null : porOrgao.get(etapa.idOrgao) ?? null,
          ),
        };
      }),
      meta: buildMeta(total, page, limit),
    };
  }

  private async placaresPorVotacao(votingIds: number[]): Promise<Map<number, Placar>> {
    if (votingIds.length === 0) {
      return new Map();
    }

    const linhas = await this.prisma.vote.groupBy({
      by: ['votingId', 'choice'],
      where: { votingId: { in: votingIds } },
      _count: { _all: true },
    });

    const porVotacao = new Map<
      number,
      { choice: VoteChoice; _count: { _all: number } }[]
    >();

    for (const linha of linhas) {
      const atual = porVotacao.get(linha.votingId) ?? [];
      atual.push({ choice: linha.choice, _count: { _all: linha._count._all } });
      porVotacao.set(linha.votingId, atual);
    }

    return new Map(
      votingIds.map((id) => [id, montarPlacar(porVotacao.get(id) ?? [])]),
    );
  }

  private async ensurePropositionExists(id: number) {
    const proposition = await this.prisma.proposition.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!proposition) {
      throw new NotFoundError('Proposição não encontrada.');
    }
  }

  private buildWhere(filters: PropositionFilters): Prisma.PropositionWhereInput {
    const where: Prisma.PropositionWhereInput = {};

    // A sigla se repete entre as casas (`PL` existe nas duas), por isso o
    // filtro é pela relação e combina com `casa` quando ela vier junto.
    if (filters.tipo) {
      where.propositionType = { sigla: filters.tipo.toUpperCase() };
    }

    if (filters.ano !== undefined) {
      where.year = filters.ano;
    }

    if (filters.casa) {
      where.house = casaLegislativa(filters.casa);
    }

    if (filters.situacao) {
      where.currentStatus = { contains: filters.situacao };
    }

    // A mesma descrição costuma existir nas duas casas com ids diferentes
    // (`tema` é único por `codigoExterno + casa + nivel`). Filtrar pela
    // descrição pega as duas, que é o que o usuário espera ao escolher
    // "Saúde" num dropdown.
    if (filters.tema) {
      where.temaProposicao = { some: { tema: { descricao: filters.tema } } };
    }

    // Busca do servidor, não do cliente: com o universo completo carregado, o
    // navegador só teria em mãos a página corrente — o termo quase sempre
    // casaria numa página que ele não baixou.
    //
    // A collation das tabelas é `utf8mb4_unicode_ci`, então o LIKE já é
    // insensível a caixa E a acento: `saude` encontra `Saúde`.
    if (filters.busca) {
      where.OR = [
        { summary: { contains: filters.busca } },
        { number: { contains: filters.busca } },
      ];
    }

    // Cruza autoria com os demais filtros no banco. Sem isto o cliente
    // precisava paginar as proposições do parlamentar e recortar em memória,
    // truncando o painel do perfil.
    if (filters.autor !== undefined) {
      where.authors = { some: { parliamentarianId: filters.autor } };
    }

    return where;
  }
}

function referenciaProposicao(proposition: PropositionRef) {
  return {
    id: proposition.id,
    casa: proposition.house,
    sigla: proposition.propositionType?.sigla ?? null,
    numero: proposition.number,
    ano: proposition.year,
  };
}

function referenciaOrgao(
  orgao:
    | {
        idOrgao: number;
        sigla: string | null;
        nome: string | null;
        tipoOrgao: string | null;
        casa: string;
      }
    | null
    | undefined,
) {
  if (!orgao) {
    return null;
  }

  return {
    id: orgao.idOrgao,
    sigla: orgao.sigla,
    nome: orgao.nome,
    tipoOrgao: orgao.tipoOrgao,
    casa: orgao.casa,
  };
}

function unicos(valores: (number | null)[]): number[] {
  return [...new Set(valores.filter((valor): valor is number => valor !== null))];
}

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().split('T')[0] : null;
}
