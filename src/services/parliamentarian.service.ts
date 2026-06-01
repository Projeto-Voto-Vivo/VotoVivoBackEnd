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
};

type ListExpensesFilters = {
  ano?: number;
  mes?: number;
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

    const parliamentarians = await this.prisma.parliamentarian.findMany({
      where,
      orderBy: {
        ballotName: 'asc',
      },
      select: {
        id: true,
        ballotName: true,
        currentParty: true,
        state: true,
        photoUrl: true,
      },
    });

    return parliamentarians.map((parliamentarian) => ({
      id: parliamentarian.id,
      nomeParlamentar: parliamentarian.ballotName ?? '',
      siglaPartido: parliamentarian.currentParty ?? '',
      uf: parliamentarian.state ?? '',
      urlFoto: parliamentarian.photoUrl ?? '',
    }));
  }

  async getParliamentarianById(id: number) {
    const parliamentarian = await this.prisma.parliamentarian.findUnique({
      where: { id },
      select: {
        id: true,
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

    const page =
      filters.pagina && Number.isInteger(filters.pagina) && filters.pagina > 0
        ? filters.pagina
        : 1;

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

    const expenses = await this.prisma.expense.findMany({
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
    });

    return expenses.map((expense) => ({
      data: expense.expenseDate
        ? expense.expenseDate.toISOString().split('T')[0]
        : null,
      tipo: expense.category ?? '',
      fornecedor: expense.supplierName ?? '',
      valor: Number(expense.amount ?? 0),
      urlDocumento: expense.invoiceUrl,
    }));
  }

  async getExpenseSummaryByParliamentarianId(parliamentarianId: number) {
    await this.ensureParliamentarianExists(parliamentarianId);

    const groupedExpenses = await this.prisma.expense.groupBy({
      by: ['category'],
      where: {
        parliamentarianId,
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        category: 'asc',
      },
    });

    return groupedExpenses.map((group) => ({
      tipoDespesa: group.category ?? 'Não informado',
      total: Number(group._sum.amount ?? 0),
    }));
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
