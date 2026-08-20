import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { buildMeta, Pagination, TAMANHO_PAGINA_PADRAO } from '../lib/request-params';

type PropositionRef = {
  id: number;
  house: string | null;
  number: string | null;
  year: number | null;
  propositionType: { sigla: string | null } | null;
};

export class PropositionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listPropositions(
    pagination: Pagination = { page: 1, limit: TAMANHO_PAGINA_PADRAO },
  ) {
    const { page, limit } = pagination;

    const [propositions, total] = await Promise.all([
      this.prisma.proposition.findMany({
        include: {
          propositionType: true,
          temaProposicao: { include: { tema: true } },
        },
        orderBy: [{ year: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.proposition.count(),
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
      meta: buildMeta(total, page, limit),
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
