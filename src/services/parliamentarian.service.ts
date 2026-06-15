import { PrismaClient } from '@prisma/client';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

type ListParliamentariansFilters = {
  nome?: string;
  partido?: string;
  uf?: string;
  pagina?: number;
};

type ListExpensesFilters = {
  ano?: number;
  mes?: number;
  pagina?: number;
};

type ExpenseSummaryFilters = {
  ano?: number;
  mes?: number;
};

type PaginatedFilters = {
  pagina?: number;
};

export class ParliamentarianService {
  private readonly pageSize = 20;

  constructor(private readonly prisma: PrismaClient) {}

  async listParliamentarians(filters: ListParliamentariansFilters) {
    const where: any = {};

    if (filters.nome) {
      where.OR = [
        {
          ballotName: {
            contains: filters.nome,
          },
        },
        {
          civilName: {
            contains: filters.nome,
          },
        },
      ];
    }

    if (filters.partido) {
      where.currentParty = filters.partido.toUpperCase();
    }

    if (filters.uf) {
      where.state = filters.uf.toUpperCase();
    }

    const page = this.normalizePage(filters.pagina);

    const [parliamentarians, total] = await Promise.all([
      this.prisma.parliamentarian.findMany({
        where,
        orderBy: {
          ballotName: 'asc',
        },
        select: {
          id: true,
          role: true,
          ballotName: true,
          currentParty: true,
          state: true,
          photoUrl: true,
        },
        skip: (page - 1) * this.pageSize,
        take: this.pageSize,
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
      })),
      meta: {
        total,
        page,
        lastPage: Math.max(1, Math.ceil(total / this.pageSize)),
        limit: this.pageSize,
      },
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
        socialNetworks: {
          select: {
            platform: true,
            url: true,
          },
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
      dataNascimento: parliamentarian.birthDate
        ? parliamentarian.birthDate.toISOString().split('T')[0]
        : null,
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
    };
  }

  async listExpensesByParliamentarianId(
    parliamentarianId: number,
    filters: ListExpensesFilters,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const page = this.normalizePage(filters.pagina);

    const where: any = {
      parliamentarianId,
    };

    if (filters.ano || filters.mes) {
      const year = filters.ano ?? new Date().getFullYear();
      const month = filters.mes;

      const startDate = new Date(year, month ? month - 1 : 0, 1);
      const endDate = month
        ? new Date(year, month, 1)
        : new Date(year + 1, 0, 1);

      where.expenseDate = {
        gte: startDate,
        lt: endDate,
      };
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: {
          expenseDate: 'desc',
        },
        skip: (page - 1) * this.pageSize,
        take: this.pageSize,
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
        data: expense.expenseDate
          ? expense.expenseDate.toISOString().split('T')[0]
          : null,
        tipo: expense.category ?? '',
        fornecedor: expense.supplierName ?? '',
        valor: Number(expense.amount ?? 0),
        urlDocumento: expense.invoiceUrl,
      })),
      meta: {
        total,
        page,
        lastPage: Math.max(1, Math.ceil(total / this.pageSize)),
        limit: this.pageSize,
      },
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
          where: {
            parliamentarianId,
            expenseDate: {
              not: null,
            },
          },
          orderBy: {
            expenseDate: 'desc',
          },
          select: {
            expenseDate: true,
          },
        });

    const summaryYear = requestedYear ?? latestExpense?.expenseDate?.getFullYear();
    const where: any = {
      parliamentarianId,
    };

    if (summaryYear) {
      const startDate = new Date(summaryYear, requestedMonth ? requestedMonth - 1 : 0, 1);
      const endDate = requestedMonth
        ? new Date(summaryYear, requestedMonth, 1)
        : new Date(summaryYear + 1, 0, 1);

      where.expenseDate = {
        gte: startDate,
        lt: endDate,
      };
    }

    const [groupedExpenses, totals] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['category'],
        where,
        _sum: {
          amount: true,
        },
        orderBy: {
          category: 'asc',
        },
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: {
          amount: true,
        },
        _max: {
          amount: true,
        },
      }),
    ]);

    const totalAno = Number(totals._sum.amount ?? 0);
    const mediaMensal = totalAno / (requestedMonth ? 1 : 12);
    const maiorReembolso = Number(totals._max.amount ?? 0);

    return {
      totalAno,
      mediaMensal,
      maiorReembolso,
      categorias: groupedExpenses.map((group) => ({
        tipoDespesa: group.category ?? 'Não informado',
        total: Number(group._sum.amount ?? 0),
      })),
    };
  }

  async listAmendmentsByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const links = await this.prisma.amendmentParliamentarian.findMany({
      where: {
        parliamentarianId,
      },
      orderBy: {
        amendmentId: 'asc',
      },
      include: {
        amendment: true,
      },
    });

    return links.map((link) => ({
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
      metodoVinculo: link.linkMethod,
      confiancaVinculo: Number(link.confidence ?? 0),
    }));
  }

  async getAmendmentSummaryByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const links = await this.prisma.amendmentParliamentarian.findMany({
      where: {
        parliamentarianId,
      },
      select: {
        amendmentId: true,
        amendment: {
          select: {
            committedAmount: true,
            liquidatedAmount: true,
            paidAmount: true,
          },
        },
      },
    });

    return links.reduce(
      (summary, link) => ({
        totalEmendas: summary.totalEmendas + 1,
        totalEmpenhado:
          summary.totalEmpenhado + Number(link.amendment.committedAmount ?? 0),
        totalLiquidado:
          summary.totalLiquidado + Number(link.amendment.liquidatedAmount ?? 0),
        totalPago: summary.totalPago + Number(link.amendment.paidAmount ?? 0),
      }),
      {
        totalEmendas: 0,
        totalEmpenhado: 0,
        totalLiquidado: 0,
        totalPago: 0,
      },
    );
  }

	async listPropositionsByParliamentarianId(
    parliamentarianId: number,
    filters: PaginatedFilters,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const page = this.normalizePage(filters.pagina);

    const [authorships, total] = await Promise.all([
      this.prisma.propositionAuthor.findMany({
        where: { parliamentarianId },
        include: { proposition: { include: { propositionType: true } } },
        orderBy: [
          { proposition: { year: 'desc' } },
          { proposition: { id: 'desc' } }
        ],
        skip: (page - 1) * this.pageSize,
        take: this.pageSize,
      }),
      this.prisma.propositionAuthor.count({
        where: { parliamentarianId },
      }),
    ]);

    return {
      data: authorships.map(({ proposition }) => ({
        id: proposition.id,
        sigla: proposition.propositionType?.sigla ?? null,
        numero: proposition.number,
        ano: proposition.year,
        ementa: proposition.summary,
        situacao: proposition.currentStatus,
      })),
      meta: {
        total,
        page,
        lastPage: Math.max(1, Math.ceil(total / this.pageSize)),
        limit: this.pageSize,
      },
    };
  }

  async listVotingsByParliamentarianId(
    parliamentarianId: number,
    filters: PaginatedFilters,
  ) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const page = this.normalizePage(filters.pagina);

    const [votes, total] = await Promise.all([
      this.prisma.vote.findMany({
        where: { parliamentarianId },
        include: {
          voting: {
            include: {
              proposition: {
                include: {
                  propositionType: true,
                },
              },
            },
          },
        },
        orderBy: { voting: { votingDate: 'desc' } },
        skip: (page - 1) * this.pageSize,
        take: this.pageSize,
      }),
      this.prisma.vote.count({ where: { parliamentarianId } }),
    ]);

    return {
      data: votes.map((vote) => {
        const proposition = vote.voting.proposition;

        return {
          id: vote.voting.id,
          data: vote.voting.votingDate
            ? vote.voting.votingDate.toISOString().split('T')[0]
            : null,
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
      meta: {
        total,
        page,
        lastPage: Math.max(1, Math.ceil(total / this.pageSize)),
        limit: this.pageSize,
      },
    };
  }

  async getPresenceByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const votes = await this.prisma.vote.findMany({
      where: { parliamentarianId },
      select: { choice: true },
    });

    const total = votes.length;
    const faltas = votes.filter((v) => v.choice === 'ABSENT').length;
    const taxa = total > 0 ? ((total - faltas) / total) * 100 : 0;

    return {
      presenca: {
        sessoesDeliberativas: {
          taxa: parseFloat(taxa.toFixed(1)),
          totalEventos: total,
          faltas,
        },
        naoSessoesDeliberativas: {
          taxa: 0,
          totalEventos: 0,
          faltas: 0,
        },
      },
    };
  }

  async getAggregatedProfile(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const [
      visaoGeral,
      presence,
      votingHistory,
      propositionHistory,
      despesas,
      emendas,
    ] = await Promise.all([
      this.getParliamentarianById(parliamentarianId),
      this.getPresenceByParliamentarianId(parliamentarianId),
      this.listVotingsByParliamentarianId(parliamentarianId, { pagina: 1 }),
      this.listPropositionsByParliamentarianId(parliamentarianId, {
        pagina: 1,
      }),
      this.getExpenseSummaryByParliamentarianId(parliamentarianId),
      this.getAmendmentSummaryByParliamentarianId(parliamentarianId),
    ]);

    return {
      visaoGeral,
      votacoes: {
        presenca: presence.presenca,
        alinhamento: null,
        recentes: votingHistory.data,
      },
      proposicoes: {
        total: propositionHistory.meta.total,
        aprovadas: 0,
        recentes: propositionHistory.data,
      },
      despesas,
      emendas,
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

    const type = proposition.propositionType?.sigla;
    const number = proposition.number;
    const year = proposition.year;
    const identifier = [type, number, year ? String(year) : null]
      .filter(Boolean)
      .join(' ');

    if (!identifier) {
      return proposition.summary ?? 'Proposição vinculada';
    }

    return identifier.replace(/ (\d{4})$/, '/$1');
  }

  private normalizePage(pagina?: number): number {
    return pagina && Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
  }

  private normalizeYear(ano?: number): number | undefined {
    return ano && Number.isInteger(ano) && ano > 0 ? ano : undefined;
  }

  private normalizeMonth(mes?: number): number | undefined {
    return mes && Number.isInteger(mes) && mes >= 1 && mes <= 12
      ? mes
      : undefined;
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
