import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { casaLegislativa } from '../lib/casas';
import { buildMeta, Pagination, TAMANHO_PAGINA_PADRAO } from '../lib/request-params';

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
};

/** Teto de situações distintas devolvidas em `/proposicoes/filtros`. */
const MAX_SITUACOES = 100;

export class PropositionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listPropositions(
    pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO },
    filters: PropositionFilters = {},
  ) {
    const { page, limit } = pagination;
    const where = this.buildWhere(filters);

    const [propositions, total] = await Promise.all([
      this.prisma.proposition.findMany({
        where,
        include: {
          propositionType: true,
          temaProposicao: { include: { tema: true } },
        },
        orderBy: [{ year: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.proposition.count({ where }),
    ]);

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
      meta: buildMeta(total, page, limit),
      filtros: {
        tipo: filters.tipo ?? null,
        ano: filters.ano ?? null,
        casa: filters.casa ?? null,
        situacao: filters.situacao ?? null,
        tema: filters.tema ?? null,
        busca: filters.busca ?? null,
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
        votings: true,
        relations: {
          include: { related: { include: { propositionType: true } } },
        },
      },
    });

    if (!proposition) {
      throw new NotFoundError('Proposição não encontrada.');
    }

    const relacionadas = proposition.relations;
    const porTipo = (tipo: string) =>
      relacionadas
        .filter((relacao) => relacao.relationType === tipo)
        .map((relacao) => referenciaProposicao(relacao.related));

    return {
      id: proposition.id,
      casa: proposition.house,
      sigla: proposition.propositionType?.sigla ?? null,
      numero: proposition.number,
      ano: proposition.year,
      ementa: proposition.summary,
      situacao: proposition.currentStatus,
      dataApresentacao: toIsoDate(proposition.presentationDate),
      temas: proposition.temaProposicao.map((link) => link.tema.descricao),
      // Jornada bicameral: a mesma materia costuma existir nas duas casas com
      // ids diferentes; sem `proposicaoRelacao` elas apareciam desconexas.
      jornada: {
        mesmaMateria: porTipo('MESMA_MATERIA'),
        principal: porTipo('PRINCIPAL')[0] ?? null,
        anteriores: porTipo('ANTERIOR'),
        posteriores: porTipo('POSTERIOR'),
      },
      votacoes: proposition.votings.map((voting) => ({
        id: voting.id,
        casa: voting.casa,
        data: voting.votingDate,
        resumo: voting.subjectSummary,
        resultado: voting.finalResult,
        tipo: voting.votingType,
      })),
    };
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

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().split('T')[0] : null;
}
