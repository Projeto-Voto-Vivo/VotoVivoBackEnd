import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import {
  acumular,
  Balde,
  baldeVazio,
  classificarEscopo,
  classificarNatureza,
  fimDoDia,
  resumirBalde,
} from '../domain/presence';
import { cargoDaCasa } from '../lib/casas';
import { AlignmentService } from './alignment.service';
import { ThemeProfileService } from './theme-profile.service';
import {
  buildMeta,
  Pagination,
  TAMANHO_PAGINA_PADRAO,
} from '../lib/request-params';

// Reexportado por compatibilidade: varios modulos e specs importam
// `NotFoundError` daqui desde antes de existir `src/errors/`.
export { NotFoundError };

const FONTE_PRESENCA_POR_CASA: Record<string, { fonte: string; observacao?: string }> = {
  Camara: { fonte: 'presenca (plenário e comissões, portal da Câmara)' },
  Senado: {
    fonte: 'presenca (painel das sessões deliberativas)',
    observacao:
      'Sem cobertura de comissões — comparável à Câmara apenas em plenario/deliberativas.',
  },
  Congresso: { fonte: 'presenca (sessões conjuntas do Congresso Nacional)' },
};

type ListParliamentariansFilters = {
  nome?: string;
  partido?: string;
  uf?: string;
  casa?: string;
  pagina?: number;
  limite?: number;
};

type ListExpensesFilters = {
  ano?: number;
  mes?: number;
  pagina?: number;
  limite?: number;
};

type ExpenseSummaryFilters = {
  ano?: number;
  mes?: number;
};

type PaginatedFilters = {
  pagina?: number;
  limite?: number;
};

export class ParliamentarianService {
  private readonly alignmentService: AlignmentService;
  private readonly themeProfileService: ThemeProfileService;

  constructor(private readonly prisma: PrismaClient) {
    this.alignmentService = new AlignmentService(prisma);
    this.themeProfileService = new ThemeProfileService(prisma);
  }

  async listParliamentarians(filters: ListParliamentariansFilters) {
    const where: Prisma.ParliamentarianWhereInput = {};

    if (filters.nome) {
      where.OR = [
        { ballotName: { contains: filters.nome } },
        { civilName: { contains: filters.nome } },
      ];
    }

    if (filters.partido) {
      where.currentParty = filters.partido.toUpperCase();
    }

    if (filters.uf) {
      where.state = filters.uf.toUpperCase();
    }

    // Filtro por casa no servidor: o frontend fazia fan-out de ~30 requisicoes
    // para filtrar em memoria. `cargoDaCasa` lanca 400 para casa desconhecida.
    if (filters.casa) {
      where.role = cargoDaCasa(filters.casa);
    }

    const { page, limit } = this.toPagination(filters);

    const [parliamentarians, total] = await Promise.all([
      this.prisma.parliamentarian.findMany({
        where,
        orderBy: { ballotName: 'asc' },
        select: {
          id: true,
          role: true,
          ballotName: true,
          currentParty: true,
          state: true,
          photoUrl: true,
          mandateCondition: true,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.parliamentarian.count({ where }),
    ]);

    return {
      data: parliamentarians.map((parliamentarian) => ({
        id: parliamentarian.id,
        nomeParlamentar: parliamentarian.ballotName ?? '',
        siglaPartido: parliamentarian.currentParty ?? '',
        uf: parliamentarian.state ?? '',
        urlFoto: parliamentarian.photoUrl ?? '',
        cargo: parliamentarian.role,
        condicaoMandato: parliamentarian.mandateCondition,
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  async getParliamentarianById(id: number) {
    const parliamentarian = await this.prisma.parliamentarian.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        ballotName: true,
        civilName: true,
        currentParty: true,
        state: true,
        photoUrl: true,
        birthDate: true,
        email: true,
        phone: true,
        officeAddress: true,
        mandateCondition: true,
        socialNetworks: {
          select: { platform: true, url: true },
        },
        partyAffiliations: {
          select: { party: true, startDate: true, endDate: true },
          orderBy: { startDate: 'asc' },
        },
        mandateTerms: {
          select: { startDate: true, endDate: true, description: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!parliamentarian) {
      throw new NotFoundError('Parlamentar não encontrado.');
    }

    return {
      id: parliamentarian.id,
      nomeParlamentar: parliamentarian.ballotName ?? '',
      siglaPartido: parliamentarian.currentParty ?? '',
      uf: parliamentarian.state ?? '',
      urlFoto: parliamentarian.photoUrl ?? '',
      cargo: parliamentarian.role,
      nomeCivil: parliamentarian.civilName,
      // Antes o frontend exibia 'Em exercício' hardcoded para todo mundo.
      condicaoMandato: parliamentarian.mandateCondition,
      dataNascimento: toIsoDate(parliamentarian.birthDate),
      email: parliamentarian.email,
      gabinete: {
        telefone: parliamentarian.phone,
        endereco: parliamentarian.officeAddress,
      },
      redesSociais: parliamentarian.socialNetworks
        .filter((socialNetwork) => socialNetwork.platform && socialNetwork.url)
        .map((socialNetwork) => ({
          rede: socialNetwork.platform as string,
          url: socialNetwork.url as string,
        })),
      historicoPartidario: parliamentarian.partyAffiliations.map((affiliation) => ({
        sigla: affiliation.party,
        inicio: toIsoDate(affiliation.startDate),
        fim: toIsoDate(affiliation.endDate),
      })),
      periodosMandato: parliamentarian.mandateTerms.map((term) => ({
        inicio: toIsoDate(term.startDate),
        fim: toIsoDate(term.endDate),
        descricao: term.description,
      })),
    };
  }

  async listCommitteesByParliamentarianId(
    parliamentarianId: number,
    filters: PaginatedFilters = {},
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const { page, limit } = this.toPagination(filters);

    const [memberships, total] = await Promise.all([
      this.prisma.orgaoMembership.findMany({
        where: { parliamentarianId },
        include: { orgao: true },
        orderBy: [{ orgao: { sigla: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.orgaoMembership.count({ where: { parliamentarianId } }),
    ]);

    return {
      data: memberships.map((membership) => ({
        id: membership.orgao.idOrgao,
        sigla: membership.orgao.sigla,
        nome: membership.orgao.nome,
        tipoOrgao: membership.orgao.tipoOrgao,
        casa: membership.orgao.casa,
        cargo: membership.role,
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Em que temas o parlamentar mais legisla e como vota em proposições de cada
   * tema. Ver `ThemeProfileService` para as ressalvas metodológicas — elas
   * viajam no `metadata` do payload.
   */
  async getThemeProfileByParliamentarianId(
    parliamentarianId: number,
    limite?: number,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    return this.themeProfileService.getThemeProfile(parliamentarianId, limite);
  }

  /**
   * Fidelidade partidaria isolada.
   *
   * Existe como metodo proprio porque a taxa so vivia dentro de
   * `getAggregatedProfile`, que dispara todas as consultas do parlamentar — o
   * cliente pagava um perfil inteiro para preencher um card.
   *
   * O 404 e daqui: o `AlignmentService` nao valida existencia, e sem esta
   * checagem um id inexistente devolveria um payload valido e vazio, que a
   * interface leria como "parlamentar sem comparacoes".
   */
  async getAlignmentByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    return this.alignmentService.getAlignmentByParliamentarianId(parliamentarianId);
  }

  async listExpensesByParliamentarianId(
    parliamentarianId: number,
    filters: ListExpensesFilters,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const { page, limit } = this.toPagination(filters);

    const where: Prisma.ExpenseWhereInput = { parliamentarianId };
    const janela = this.buildExpenseWindow(filters.ano, filters.mes);

    if (janela) {
      where.expenseDate = janela;
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          expenseDate: true,
          category: true,
          supplierName: true,
          amount: true,
          invoiceUrl: true,
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses.map((expense) => ({
        data: toIsoDate(expense.expenseDate),
        tipo: expense.category ?? '',
        fornecedor: expense.supplierName ?? '',
        valor: Number(expense.amount ?? 0),
        urlDocumento: expense.invoiceUrl,
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  async getExpenseSummaryByParliamentarianId(
    parliamentarianId: number,
    filters: ExpenseSummaryFilters = {},
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const requestedYear = this.normalizeYear(filters.ano);
    const requestedMonth = this.normalizeMonth(filters.mes);

    const latestExpense = requestedYear
      ? null
      : await this.prisma.expense.findFirst({
          where: { parliamentarianId, expenseDate: { not: null } },
          orderBy: { expenseDate: 'desc' },
          select: { expenseDate: true },
        });

    const summaryYear = requestedYear ?? latestExpense?.expenseDate?.getFullYear();
    const where: Prisma.ExpenseWhereInput = { parliamentarianId };
    const janela = this.buildExpenseWindow(summaryYear, requestedMonth);

    if (janela) {
      where.expenseDate = janela;
    }

    const [groupedExpenses, totals, mesesComDados] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _max: { amount: true },
      }),
      this.countExpenseMonthsInMandate(parliamentarianId, janela),
    ]);

    const totalAno = Number(totals._sum.amount ?? 0);

    return {
      totalAno,
      // Antes: `totalAno / 12` fixo, que subestimava quem tem menos de um ano
      // de dados. Agora divide pelos meses que realmente tem despesa dentro do
      // exercicio do mandato; sem dados, `null` — nunca 0.
      mediaMensal: mesesComDados > 0 ? totalAno / mesesComDados : null,
      mesesConsiderados: mesesComDados,
      maiorReembolso: Number(totals._max.amount ?? 0),
      categorias: groupedExpenses.map((group) => ({
        tipoDespesa: group.category ?? 'Não informado',
        total: Number(group._sum.amount ?? 0),
      })),
    };
  }

  async listAmendmentsByParliamentarianId(
    parliamentarianId: number,
    filters: PaginatedFilters = {},
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const { page, limit } = this.toPagination(filters);

    const [links, total] = await Promise.all([
      this.prisma.amendmentParliamentarian.findMany({
        where: { parliamentarianId },
        orderBy: { amendmentId: 'asc' },
        include: { amendment: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.amendmentParliamentarian.count({ where: { parliamentarianId } }),
    ]);

    return {
      data: links.map((link) => ({
        id: link.amendment.id,
        codigoEmenda: link.amendment.code,
        ano: link.amendment.year,
        tipoEmenda: link.amendment.amendmentType,
        autor: link.amendment.author,
        nomeAutor: link.amendment.authorName,
        numeroEmenda: link.amendment.amendmentNumber,
        localidadeDoGasto: link.amendment.spendingLocation,
        funcao: link.amendment.functionName,
        subfuncao: link.amendment.subfunctionName,
        valorEmpenhado: Number(link.amendment.committedAmount ?? 0),
        valorLiquidado: Number(link.amendment.liquidatedAmount ?? 0),
        valorPago: Number(link.amendment.paidAmount ?? 0),
        valorRestoInscrito: Number(link.amendment.remainderRegistered ?? 0),
        valorRestoCancelado: Number(link.amendment.remainderCanceled ?? 0),
        valorRestoPago: Number(link.amendment.remainderPaid ?? 0),
        // O vinculo emenda-parlamentar e heuristico: expor o metodo e a
        // confianca deixa isso auditavel em vez de implicito.
        metodoVinculo: link.linkMethod,
        confiancaVinculo: link.confidence === null ? null : Number(link.confidence),
      })),
      meta: buildMeta(total, page, limit),
    };
  }

  async getAmendmentSummaryByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    // Agregacao no banco. Antes era um `reduce` em JS sobre todos os vinculos.
    const [totalEmendas, somas] = await Promise.all([
      this.prisma.amendmentParliamentarian.count({ where: { parliamentarianId } }),
      this.prisma.amendment.aggregate({
        where: { parliamentarianLinks: { some: { parliamentarianId } } },
        _sum: {
          committedAmount: true,
          liquidatedAmount: true,
          paidAmount: true,
        },
      }),
    ]);

    return {
      totalEmendas,
      totalEmpenhado: Number(somas._sum.committedAmount ?? 0),
      totalLiquidado: Number(somas._sum.liquidatedAmount ?? 0),
      totalPago: Number(somas._sum.paidAmount ?? 0),
    };
  }

  async listPropositionsByParliamentarianId(
    parliamentarianId: number,
    filters: PaginatedFilters,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const { page, limit } = this.toPagination(filters);

    const [authorships, total] = await Promise.all([
      this.prisma.propositionAuthor.findMany({
        where: { parliamentarianId },
        include: {
          proposition: {
            include: {
              propositionType: true,
              temaProposicao: { include: { tema: true } },
            },
          },
        },
        orderBy: [
          { proposition: { year: 'desc' } },
          { proposition: { id: 'desc' } },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.propositionAuthor.count({ where: { parliamentarianId } }),
    ]);

    return {
      data: authorships.map(({ proposition }) => ({
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
      meta: buildMeta(total, page, limit),
    };
  }

  async listVotingsByParliamentarianId(
    parliamentarianId: number,
    filters: PaginatedFilters,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const { page, limit } = this.toPagination(filters);

    const [votes, total] = await Promise.all([
      this.prisma.vote.findMany({
        where: { parliamentarianId },
        include: {
          voting: {
            include: {
              proposition: { include: { propositionType: true } },
            },
          },
        },
        orderBy: { voting: { votingDate: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vote.count({ where: { parliamentarianId } }),
    ]);

    return {
      data: votes.map((vote) => {
        const proposition = vote.voting.proposition;

        return {
          id: vote.voting.id,
          casa: vote.voting.casa,
          data: toIsoDate(vote.voting.votingDate),
          titulo: this.formatVotingTitle(proposition),
          tema: proposition?.summary ?? null,
          resumo: vote.voting.subjectSummary,
          voto: vote.choice,
          resultado: vote.voting.finalResult,
          tipo: vote.voting.votingType,
          proposicao: proposition
            ? {
                id: proposition.id,
                tipo: proposition.propositionType?.sigla ?? null,
                numero: proposition.number,
                ano: proposition.year,
                ementa: proposition.summary,
                situacao: proposition.currentStatus,
              }
            : null,
        };
      }),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Taxa de presenca a partir EXCLUSIVAMENTE da tabela `presenca`.
   *
   * O que mudou em relacao a versao anterior:
   *  - o ramo que sintetizava presenca do Senado agrupando votos por dia foi
   *    removido. O agregador agora grava presenca real do Senado; manter os
   *    dois lados causava contagem dupla. Este metodo nao le `voto`.
   *  - a classificacao de sessao passou a ser por igualdade normalizada contra
   *    listas explicitas (ver `src/domain/presence.ts`).
   *  - plenario e comissao viraram baldes separados.
   *  - o denominador e restrito aos periodos de `mandatoExercicio`.
   */
  async getPresenceByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const termos = await this.prisma.mandateTerm.findMany({
      where: { parliamentarianId },
      select: { startDate: true, endDate: true, description: true },
      orderBy: { startDate: 'asc' },
    });

    // Um ramo de OR por periodo de exercicio: filtra no banco em vez de trazer
    // o historico inteiro para a memoria.
    const janelas = termos.map((termo) => ({
      event: {
        dataHoraInicio: {
          gte: termo.startDate,
          ...(termo.endDate ? { lte: fimDoDia(termo.endDate) } : {}),
        },
      },
    }));

    const presences = await this.prisma.presence.findMany({
      where: {
        parliamentarianId,
        ...(janelas.length ? { OR: janelas } : {}),
      },
      select: {
        status: true,
        event: {
          select: {
            dataHoraInicio: true,
            house: true,
            descricaoTipo: true,
            orgao: { select: { tipoOrgao: true, sigla: true } },
          },
        },
      },
    });

    const baldes: Record<'plenario' | 'comissoes', Record<'deliberativas' | 'naoDeliberativas', Balde>> = {
      plenario: { deliberativas: baldeVazio(), naoDeliberativas: baldeVazio() },
      comissoes: { deliberativas: baldeVazio(), naoDeliberativas: baldeVazio() },
    };

    let eventosSemClassificacao = 0;
    let eventosSemOrgao = 0;
    const casas = new Set<string>();

    for (const presence of presences) {
      const escopo = classificarEscopo(presence.event.orgao);
      const natureza = classificarNatureza(presence.event.descricaoTipo);

      casas.add(presence.event.house);

      if (escopo === 'INDEFINIDO') {
        eventosSemOrgao += 1;
        continue;
      }

      if (natureza === 'INDEFINIDA') {
        eventosSemClassificacao += 1;
        continue;
      }

      const grupo = escopo === 'PLENARIO' ? baldes.plenario : baldes.comissoes;
      const balde = natureza === 'DELIBERATIVA' ? grupo.deliberativas : grupo.naoDeliberativas;

      acumular(balde, presence.status);
    }

    return {
      presenca: {
        plenario: {
          deliberativas: resumirBalde(baldes.plenario.deliberativas),
          naoDeliberativas: resumirBalde(baldes.plenario.naoDeliberativas),
        },
        comissoes: {
          deliberativas: resumirBalde(baldes.comissoes.deliberativas),
          naoDeliberativas: resumirBalde(baldes.comissoes.naoDeliberativas),
        },
        excluidos: { eventosSemClassificacao, eventosSemOrgao },
        janela: {
          // Sem registros em `mandatoExercicio` a taxa nao e zerada: seria pior
          // do que uma taxa com denominador amplo e rotulada como tal.
          restritaAoExercicio: termos.length > 0,
          periodos: termos.map((termo) => ({
            inicio: toIsoDate(termo.startDate),
            fim: toIsoDate(termo.endDate),
            descricao: termo.description,
          })),
        },
        // Metodologias diferentes por casa: a UI nao pode comparar as taxas
        // sem exibir de onde cada uma veio.
        metodologia: [...casas].map((casa) => ({
          casa,
          ...(FONTE_PRESENCA_POR_CASA[casa] ?? { fonte: 'presenca' }),
        })),
      },
    };
  }

  async getAggregatedProfile(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const [
      visaoGeral,
      presence,
      alinhamento,
      votingHistory,
      propositionHistory,
      comissoes,
      despesas,
      emendas,
    ] = await Promise.all([
      this.getParliamentarianById(parliamentarianId),
      this.getPresenceByParliamentarianId(parliamentarianId),
      this.alignmentService.getAlignmentByParliamentarianId(parliamentarianId),
      this.listVotingsByParliamentarianId(parliamentarianId, { pagina: 1 }),
      this.listPropositionsByParliamentarianId(parliamentarianId, { pagina: 1 }),
      this.listCommitteesByParliamentarianId(parliamentarianId, { pagina: 1 }),
      this.getExpenseSummaryByParliamentarianId(parliamentarianId),
      this.getAmendmentSummaryByParliamentarianId(parliamentarianId),
    ]);

    return {
      visaoGeral,
      comissoes: comissoes.data,
      votacoes: {
        presenca: presence.presenca,
        alinhamento,
        recentes: votingHistory.data,
      },
      // `aprovadas` foi removido: era `0` hardcoded e o banco nao tem campo
      // estruturado de aprovacao (`statusAtual` e texto livre).
      proposicoes: {
        total: propositionHistory.meta.total,
        recentes: propositionHistory.data,
      },
      despesas,
      emendas,
    };
  }

  /**
   * Meses distintos com despesa, restritos ao exercicio do mandato quando ha
   * dados de `mandatoExercicio`. Sem esses dados, conta todos os meses — a
   * alternativa (zerar) esconderia despesas reais.
   */
  private async countExpenseMonthsInMandate(
    parliamentarianId: number,
    janela: { gte: Date; lt: Date } | undefined,
  ): Promise<number> {
    const filtroJanela = janela
      ? Prisma.sql`AND d.dataDespesa >= ${janela.gte} AND d.dataDespesa < ${janela.lt}`
      : Prisma.empty;

    const linhas = await this.prisma.$queryRaw<{ meses: bigint | number }[]>`
      SELECT COUNT(DISTINCT DATE_FORMAT(d.dataDespesa, '%Y-%m')) AS meses
      FROM despesa d
      WHERE d.idParlamentar = ${parliamentarianId}
        AND d.dataDespesa IS NOT NULL
        ${filtroJanela}
        AND (
          NOT EXISTS (
            SELECT 1 FROM mandatoExercicio m WHERE m.idParlamentar = d.idParlamentar
          )
          OR EXISTS (
            SELECT 1 FROM mandatoExercicio m
            WHERE m.idParlamentar = d.idParlamentar
              AND d.dataDespesa >= m.dataInicio
              AND (m.dataFim IS NULL OR d.dataDespesa <= m.dataFim)
          )
        )
    `;

    return Number(linhas[0]?.meses ?? 0);
  }

  private buildExpenseWindow(
    year: number | undefined,
    month: number | undefined,
  ): { gte: Date; lt: Date } | undefined {
    if (!year) {
      return undefined;
    }

    return {
      gte: new Date(year, month ? month - 1 : 0, 1),
      lt: month ? new Date(year, month, 1) : new Date(year + 1, 0, 1),
    };
  }

  private formatVotingTitle(
    proposition?: {
      propositionType?: { sigla: string | null } | null;
      number?: string | null;
      year?: number | null;
      summary?: string | null;
    } | null,
  ): string {
    if (!proposition) {
      return 'Deliberação registrada';
    }

    const identifier = [
      proposition.propositionType?.sigla,
      proposition.number,
      proposition.year ? String(proposition.year) : null,
    ]
      .filter(Boolean)
      .join(' ');

    if (!identifier) {
      return proposition.summary ?? 'Proposição vinculada';
    }

    return identifier.replace(/ (\d{4})$/, '/$1');
  }

  private toPagination(filters: { pagina?: number; limite?: number }): Pagination {
    const page =
      filters.pagina && Number.isInteger(filters.pagina) && filters.pagina > 0
        ? filters.pagina
        : 1;
    const limit =
      filters.limite && Number.isInteger(filters.limite) && filters.limite > 0
        ? filters.limite
        : TAMANHO_PAGINA_PADRAO;

    return { page, limit };
  }

  private normalizeYear(ano?: number): number | undefined {
    return ano && Number.isInteger(ano) && ano > 0 ? ano : undefined;
  }

  private normalizeMonth(mes?: number): number | undefined {
    return mes && Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : undefined;
  }

  private async ensureParliamentarianExists(id: number) {
    const parliamentarian = await this.prisma.parliamentarian.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!parliamentarian) {
      throw new NotFoundError('Parlamentar não encontrado.');
    }
  }
}

function toIsoDate(date: Date | null | undefined): string | null {
  return date ? date.toISOString().split('T')[0] : null;
}
