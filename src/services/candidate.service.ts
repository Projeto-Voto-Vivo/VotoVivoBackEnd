import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import {
  buildMeta,
  TAMANHO_PAGINA_MAX,
  TAMANHO_PAGINA_PADRAO,
} from '../lib/request-params';

type ListCandidatesFilters = {
  nome?: string;
  partido?: string;
  uf?: string;
  cargo?: string;
  ano?: number;
  pagina?: number;
  limite?: number;
};

export class CandidateService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCandidates(filters: ListCandidatesFilters) {
    const where: Prisma.CandidaturaTseWhereInput = {};

    if (filters.nome) {
      where.OR = [
        {
          nomeUrna: {
            contains: filters.nome,
          },
        },
        {
          nomeCivil: {
            contains: filters.nome,
          },
        },
      ];
    }

    if (filters.partido) {
      where.siglaPartido = filters.partido.toUpperCase();
    }

    if (filters.uf) {
      where.uf = filters.uf.toUpperCase();
    }

    if (filters.cargo) {
      where.cargo = filters.cargo;
    }

    if (filters.ano) {
      where.anoEleicao = filters.ano;
    }

    const page =
      filters.pagina &&
      Number.isInteger(filters.pagina) &&
      filters.pagina > 0
        ? filters.pagina
        : 1;

    const limit =
      filters.limite &&
      Number.isInteger(filters.limite) &&
      filters.limite > 0
        ? Math.min(filters.limite, TAMANHO_PAGINA_MAX)
        : TAMANHO_PAGINA_PADRAO;

    const [candidaturas, total] = await Promise.all([
      this.prisma.candidaturaTse.findMany({
        where,

        orderBy: [
          {
            nomeUrna: 'asc',
          },
          {
            id: 'asc',
          },
        ],

        skip: (page - 1) * limit,
        take: limit,

        select: {
          id: true,
          sqCandidato: true,
          anoEleicao: true,
          descricaoEleicao: true,
          uf: true,
          cargo: true,
          numeroCandidato: true,
          nomeUrna: true,
          nomeCivil: true,
          siglaPartido: true,
          situacaoCandidatura: true,
          resultadoEleicao: true,

          parliamentarian: {
            select: {
              id: true,
              ballotName: true,
              photoUrl: true,
            },
          },
        },
      }),

      this.prisma.candidaturaTse.count({
        where,
      }),
    ]);

    return {
      data: candidaturas.map((candidatura) => ({
        idCandidaturaTse: candidatura.id,
        sqCandidato: candidatura.sqCandidato,
        anoEleicao: candidatura.anoEleicao,
        descricaoEleicao: candidatura.descricaoEleicao,
        uf: candidatura.uf,
        cargo: candidatura.cargo,
        numeroCandidato: candidatura.numeroCandidato,
        nomeUrna: candidatura.nomeUrna,
        nomeCivil: candidatura.nomeCivil,
        siglaPartido: candidatura.siglaPartido,
        situacaoCandidatura: candidatura.situacaoCandidatura,
        resultadoEleicao: candidatura.resultadoEleicao,

        idParlamentar: candidatura.parliamentarian?.id ?? null,
        nomeParlamentar:
          candidatura.parliamentarian?.ballotName ?? null,
        fotoUrl: candidatura.parliamentarian?.photoUrl ?? null,
      })),

      meta: buildMeta(total, page, limit),
    };
  }

  async getCandidateById(id: number) {
    const candidatura =
      await this.prisma.candidaturaTse.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          sqCandidato: true,
          anoEleicao: true,
          descricaoEleicao: true,
          uf: true,
          cargo: true,
          numeroCandidato: true,
          nomeUrna: true,
          nomeCivil: true,
          siglaPartido: true,
          situacaoCandidatura: true,
          resultadoEleicao: true,

          parliamentarian: {
            select: {
              id: true,
              ballotName: true,
              photoUrl: true,
            },
          },
        },
      });

    if (!candidatura) {
      throw new NotFoundError('Candidato não encontrado.');
    }

    return {
      idCandidaturaTse: candidatura.id,
      sqCandidato: candidatura.sqCandidato,
      anoEleicao: candidatura.anoEleicao,
      descricaoEleicao: candidatura.descricaoEleicao,
      uf: candidatura.uf,
      cargo: candidatura.cargo,
      numeroCandidato: candidatura.numeroCandidato,
      nomeUrna: candidatura.nomeUrna,
      nomeCivil: candidatura.nomeCivil,
      siglaPartido: candidatura.siglaPartido,
      situacaoCandidatura: candidatura.situacaoCandidatura,
      resultadoEleicao: candidatura.resultadoEleicao,

      idParlamentar: candidatura.parliamentarian?.id ?? null,
      nomeParlamentar:
        candidatura.parliamentarian?.ballotName ?? null,
      fotoUrl: candidatura.parliamentarian?.photoUrl ?? null,
    };
  }
}