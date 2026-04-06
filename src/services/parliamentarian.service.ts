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
