import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { buildMeta, Pagination } from '../lib/request-params';

/**
 * Presidente é o único cargo gravado em mais de uma abrangência: 'BR' (total
 * nacional), cada UF e 'ZZ' (exterior). Tudo que agrega entre disputas tem de
 * ficar só com a linha nacional, ou conta o mesmo voto duas vezes.
 */
const CARGO_PRESIDENTE = 'PRESIDENTE';
const UF_NACIONAL = 'BR';

type ListResultsFilters = {
  ano?: number;
  turno?: number;
  cargo?: string;
  uf?: string;
};

type ListResultCandidatesFilters = {
  nome?: string;
  partido?: string;
  eleito?: boolean;
};

type SeatsFilters = {
  cargo: string;
  ano?: number;
  uf?: string;
};

const numero = (valor: Prisma.Decimal | null) =>
  valor === null ? null : Number(valor);

const resultadoSelect = {
  id: true,
  anoEleicao: true,
  turno: true,
  cargo: true,
  uf: true,
  vagas: true,
  quocienteEleitoral: true,
  eleitorado: true,
  comparecimento: true,
  abstencoes: true,
  percentualComparecimento: true,
  percentualAbstencao: true,
  votosTotais: true,
  votosValidos: true,
  votosNominais: true,
  votosLegenda: true,
  votosBrancos: true,
  votosNulos: true,
  votosAnuladosSubJudice: true,
  percentualValidos: true,
  percentualBrancos: true,
  percentualNulos: true,
  secoes: true,
  secoesTotalizadas: true,
  percentualSecoesTotalizadas: true,
  totalizacaoFinal: true,
  haSegundoTurno: true,
  dataTotalizacao: true,
  dataGeracao: true,
} satisfies Prisma.EleicaoResultadoSelect;

type Resultado = Prisma.EleicaoResultadoGetPayload<{
  select: typeof resultadoSelect;
}>;

function mapResultado(resultado: Resultado) {
  return {
    idEleicaoResultado: resultado.id,
    anoEleicao: resultado.anoEleicao,
    turno: resultado.turno,
    cargo: resultado.cargo,
    uf: resultado.uf,
    vagas: resultado.vagas,
    quocienteEleitoral: resultado.quocienteEleitoral,
    eleitorado: resultado.eleitorado,
    comparecimento: resultado.comparecimento,
    abstencoes: resultado.abstencoes,
    percentualComparecimento: numero(resultado.percentualComparecimento),
    percentualAbstencao: numero(resultado.percentualAbstencao),
    votosTotais: resultado.votosTotais,
    votosValidos: resultado.votosValidos,
    votosNominais: resultado.votosNominais,
    votosLegenda: resultado.votosLegenda,
    votosBrancos: resultado.votosBrancos,
    votosNulos: resultado.votosNulos,
    votosAnuladosSubJudice: resultado.votosAnuladosSubJudice,
    percentualValidos: numero(resultado.percentualValidos),
    percentualBrancos: numero(resultado.percentualBrancos),
    percentualNulos: numero(resultado.percentualNulos),
    secoes: resultado.secoes,
    secoesTotalizadas: resultado.secoesTotalizadas,
    percentualSecoesTotalizadas: numero(resultado.percentualSecoesTotalizadas),
    totalizacaoFinal: resultado.totalizacaoFinal,
    haSegundoTurno: resultado.haSegundoTurno,
    dataTotalizacao: resultado.dataTotalizacao,
    dataGeracao: resultado.dataGeracao,
  };
}

export class ElectionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listResults(filters: ListResultsFilters, { page, limit }: Pagination) {
    const where: Prisma.EleicaoResultadoWhereInput = {};

    if (filters.ano) {
      where.anoEleicao = filters.ano;
    }

    if (filters.turno) {
      where.turno = filters.turno;
    }

    if (filters.cargo) {
      where.cargo = filters.cargo.toUpperCase();
    }

    if (filters.uf) {
      where.uf = filters.uf.toUpperCase();
    }

    const [resultados, total] = await Promise.all([
      this.prisma.eleicaoResultado.findMany({
        where,
        orderBy: [
          { anoEleicao: 'desc' },
          { turno: 'asc' },
          { cargo: 'asc' },
          { uf: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: resultadoSelect,
      }),

      this.prisma.eleicaoResultado.count({ where }),
    ]);

    return {
      data: resultados.map(mapResultado),
      meta: buildMeta(total, page, limit),
    };
  }

  async getResultById(id: number) {
    const resultado = await this.prisma.eleicaoResultado.findUnique({
      where: { id },
      select: {
        ...resultadoSelect,
        partidos: {
          orderBy: [
            { cadeiras: 'desc' },
            { votos: 'desc' },
            { siglaPartido: 'asc' },
          ],
          select: {
            siglaPartido: true,
            numeroPartido: true,
            nomePartido: true,
            federacao: true,
            coligacao: true,
            cadeiras: true,
            votosNominais: true,
            votosLegenda: true,
            votos: true,
            percentualVotos: true,
          },
        },
      },
    });

    if (!resultado) {
      throw new NotFoundError('Resultado de eleição não encontrado.');
    }

    return {
      ...mapResultado(resultado),
      partidos: resultado.partidos.map((partido) => ({
        ...partido,
        percentualVotos: numero(partido.percentualVotos),
      })),
    };
  }

  async listResultCandidates(
    id: number,
    filters: ListResultCandidatesFilters,
    { page, limit }: Pagination,
  ) {
    const resultado = await this.prisma.eleicaoResultado.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!resultado) {
      throw new NotFoundError('Resultado de eleição não encontrado.');
    }

    const where: Prisma.EleicaoResultadoCandidatoWhereInput = {
      resultadoId: id,
    };

    if (filters.nome) {
      where.OR = [
        { nomeUrna: { contains: filters.nome } },
        { nomeCivil: { contains: filters.nome } },
      ];
    }

    if (filters.partido) {
      where.siglaPartido = filters.partido.toUpperCase();
    }

    if (filters.eleito !== undefined) {
      where.eleito = filters.eleito;
    }

    const [candidatos, total] = await Promise.all([
      this.prisma.eleicaoResultadoCandidato.findMany({
        where,
        orderBy: [
          { posicao: { sort: 'asc', nulls: 'last' } },
          { votos: 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          candidaturaId: true,
          sqCandidato: true,
          numeroCandidato: true,
          nomeUrna: true,
          nomeCivil: true,
          siglaPartido: true,
          coligacao: true,
          nomeVice: true,
          posicao: true,
          votos: true,
          percentualVotos: true,
          situacao: true,
          eleito: true,
          segundoTurno: true,
          situacaoVotos: true,
          candidatura: {
            select: {
              fotoUrl: true,
              parliamentarian: {
                select: { id: true, photoUrl: true },
              },
            },
          },
        },
      }),

      this.prisma.eleicaoResultadoCandidato.count({ where }),
    ]);

    return {
      data: candidatos.map((candidato) => ({
        idCandidaturaTse: candidato.candidaturaId,
        sqCandidato: candidato.sqCandidato,
        numeroCandidato: candidato.numeroCandidato,
        nomeUrna: candidato.nomeUrna,
        nomeCivil: candidato.nomeCivil,
        siglaPartido: candidato.siglaPartido,
        coligacao: candidato.coligacao,
        nomeVice: candidato.nomeVice,
        posicao: candidato.posicao,
        votos: candidato.votos,
        percentualVotos: numero(candidato.percentualVotos),
        situacao: candidato.situacao,
        eleito: candidato.eleito,
        segundoTurno: candidato.segundoTurno,
        situacaoVotos: candidato.situacaoVotos,

        idParlamentar: candidato.candidatura?.parliamentarian?.id ?? null,
        fotoUrl:
          candidato.candidatura?.fotoUrl ??
          candidato.candidatura?.parliamentarian?.photoUrl ??
          null,
      })),

      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Bancada de um cargo: cadeiras e votos por partido somados entre as
   * disputas (as 27 UFs, para Câmara e Senado).
   *
   * As cadeiras somam todos os turnos — a vaga só é conquistada no turno que
   * decide. Os votos ficam só com o 1º turno: somar os dois contaria duas
   * vezes o eleitor de quem foi ao 2º.
   */
  async getSeats(filters: SeatsFilters) {
    const cargo = filters.cargo.toUpperCase();
    const ano = filters.ano ?? (await this.latestYear());

    if (ano === null) {
      return { anoEleicao: null, cargo, uf: null, totalCadeiras: 0, data: [] };
    }

    const uf =
      filters.uf?.toUpperCase() ??
      (cargo === CARGO_PRESIDENTE ? UF_NACIONAL : undefined);

    const linhas = await this.prisma.eleicaoResultadoPartido.findMany({
      where: {
        resultado: { anoEleicao: ano, cargo, ...(uf ? { uf } : {}) },
      },
      select: {
        siglaPartido: true,
        numeroPartido: true,
        nomePartido: true,
        federacao: true,
        cadeiras: true,
        votos: true,
        resultado: { select: { turno: true } },
      },
    });

    const partidos = new Map<
      string,
      {
        siglaPartido: string;
        numeroPartido: string | null;
        nomePartido: string | null;
        federacao: string | null;
        cadeiras: number;
        votos: number;
      }
    >();

    for (const linha of linhas) {
      const partido = partidos.get(linha.siglaPartido) ?? {
        siglaPartido: linha.siglaPartido,
        numeroPartido: linha.numeroPartido,
        nomePartido: linha.nomePartido,
        federacao: linha.federacao,
        cadeiras: 0,
        votos: 0,
      };

      partido.cadeiras += linha.cadeiras;

      if (linha.resultado.turno === 1) {
        partido.votos += linha.votos ?? 0;
      }

      partidos.set(linha.siglaPartido, partido);
    }

    const data = [...partidos.values()].sort(
      (a, b) =>
        b.cadeiras - a.cadeiras ||
        b.votos - a.votos ||
        a.siglaPartido.localeCompare(b.siglaPartido),
    );

    return {
      anoEleicao: ano,
      cargo,
      uf: uf ?? null,
      totalCadeiras: data.reduce((soma, partido) => soma + partido.cadeiras, 0),
      data,
    };
  }

  private async latestYear(): Promise<number | null> {
    const { _max } = await this.prisma.eleicaoResultado.aggregate({
      _max: { anoEleicao: true },
    });

    return _max.anoEleicao;
  }
}
