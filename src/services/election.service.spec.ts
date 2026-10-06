import { Prisma } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';
import { ElectionService } from './election.service';

describe('ElectionService', () => {
  let prismaMock: any;
  let service: ElectionService;

  beforeEach(() => {
    prismaMock = {
      eleicaoResultado: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn(),
      },
      eleicaoResultadoCandidato: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      eleicaoResultadoPartido: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ElectionService(prismaMock);
  });

  const resultado = (extra: Record<string, unknown> = {}) => ({
    id: 7,
    anoEleicao: 2026,
    turno: 1,
    cargo: 'GOVERNADOR',
    uf: 'SP',
    vagas: 1,
    quocienteEleitoral: null,
    eleitorado: 1000,
    comparecimento: 800,
    abstencoes: 200,
    percentualComparecimento: new Prisma.Decimal('80.0000'),
    percentualAbstencao: new Prisma.Decimal('20.0000'),
    votosTotais: 800,
    votosValidos: 700,
    votosNominais: 700,
    votosLegenda: null,
    votosBrancos: 40,
    votosNulos: 60,
    votosAnuladosSubJudice: 0,
    percentualValidos: new Prisma.Decimal('87.5000'),
    percentualBrancos: new Prisma.Decimal('5.0000'),
    percentualNulos: null,
    secoes: 10,
    secoesTotalizadas: 10,
    percentualSecoesTotalizadas: new Prisma.Decimal('100.0000'),
    totalizacaoFinal: true,
    haSegundoTurno: false,
    dataTotalizacao: new Date('2026-10-05T03:00:00Z'),
    dataGeracao: new Date('2026-10-05T03:05:00Z'),
    ...extra,
  });

  const linhaPartido = (
    sigla: string,
    cadeiras: number,
    votos: number | null,
    turno = 1,
  ) => ({
    siglaPartido: sigla,
    numeroPartido: null,
    nomePartido: null,
    federacao: null,
    cadeiras,
    votos,
    resultado: { turno },
  });

  describe('listResults', () => {
    it('should convert decimals to numbers and keep nulls', async () => {
      prismaMock.eleicaoResultado.findMany.mockResolvedValue([resultado()]);
      prismaMock.eleicaoResultado.count.mockResolvedValue(1);

      const result = await service.listResults({}, { page: 1, limit: 20 });

      expect(result.data[0]).toMatchObject({
        idEleicaoResultado: 7,
        percentualComparecimento: 80,
        percentualValidos: 87.5,
        percentualNulos: null,
      });
      expect(result.meta.total).toBe(1);
    });

    it('should normalize cargo and uf to the casing the ETL writes', async () => {
      await service.listResults(
        { ano: 2026, turno: 2, cargo: 'governador', uf: 'sp' },
        { page: 2, limit: 10 },
      );

      expect(prismaMock.eleicaoResultado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { anoEleicao: 2026, turno: 2, cargo: 'GOVERNADOR', uf: 'SP' },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getResultById', () => {
    it('should throw NotFoundError when the result does not exist', async () => {
      prismaMock.eleicaoResultado.findUnique.mockResolvedValue(null);

      await expect(service.getResultById(99)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should return the totals with the parties', async () => {
      prismaMock.eleicaoResultado.findUnique.mockResolvedValue(
        resultado({
          partidos: [
            {
              siglaPartido: 'ABC',
              numeroPartido: '99',
              nomePartido: 'Partido ABC',
              federacao: null,
              coligacao: null,
              cadeiras: 1,
              votosNominais: 400,
              votosLegenda: 0,
              votos: 400,
              percentualVotos: new Prisma.Decimal('57.1429'),
            },
          ],
        }),
      );

      const result = await service.getResultById(7);

      expect(result.idEleicaoResultado).toBe(7);
      expect(result.partidos).toEqual([
        expect.objectContaining({ siglaPartido: 'ABC', percentualVotos: 57.1429 }),
      ]);
    });
  });

  describe('listResultCandidates', () => {
    it('should throw NotFoundError instead of an empty page for an unknown result', async () => {
      prismaMock.eleicaoResultado.findUnique.mockResolvedValue(null);

      await expect(
        service.listResultCandidates(99, {}, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prismaMock.eleicaoResultadoCandidato.findMany).not.toHaveBeenCalled();
    });

    it('should apply the filters within the result', async () => {
      prismaMock.eleicaoResultado.findUnique.mockResolvedValue({ id: 7 });

      await service.listResultCandidates(
        7,
        { nome: 'fulano', partido: 'abc', eleito: false },
        { page: 1, limit: 20 },
      );

      expect(prismaMock.eleicaoResultadoCandidato.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            resultadoId: 7,
            OR: [
              { nomeUrna: { contains: 'fulano' } },
              { nomeCivil: { contains: 'fulano' } },
            ],
            siglaPartido: 'ABC',
            eleito: false,
          },
        }),
      );
    });

    it('should link the candidate to the candidatura and the parliamentarian', async () => {
      prismaMock.eleicaoResultado.findUnique.mockResolvedValue({ id: 7 });
      prismaMock.eleicaoResultadoCandidato.count.mockResolvedValue(2);
      prismaMock.eleicaoResultadoCandidato.findMany.mockResolvedValue([
        {
          candidaturaId: 3,
          sqCandidato: '250001',
          numeroCandidato: '99',
          nomeUrna: 'FULANO',
          nomeCivil: 'FULANO DA SILVA',
          siglaPartido: 'ABC',
          coligacao: null,
          nomeVice: 'BELTRANA',
          posicao: 1,
          votos: 400,
          percentualVotos: new Prisma.Decimal('57.1429'),
          situacao: 'Eleito',
          eleito: true,
          segundoTurno: false,
          situacaoVotos: 'Válido',
          candidatura: {
            fotoUrl: null,
            parliamentarian: { id: 12, photoUrl: 'foto-12' },
          },
        },
        {
          candidaturaId: null,
          sqCandidato: '250002',
          numeroCandidato: '98',
          nomeUrna: 'SICRANO',
          nomeCivil: null,
          siglaPartido: 'XYZ',
          coligacao: null,
          nomeVice: null,
          posicao: 2,
          votos: 300,
          percentualVotos: null,
          situacao: 'Não eleito',
          eleito: false,
          segundoTurno: false,
          situacaoVotos: null,
          candidatura: null,
        },
      ]);

      const result = await service.listResultCandidates(7, {}, { page: 1, limit: 20 });

      expect(result.data[0]).toMatchObject({
        idCandidaturaTse: 3,
        percentualVotos: 57.1429,
        idParlamentar: 12,
        fotoUrl: 'foto-12',
      });
      expect(result.data[1]).toMatchObject({
        idCandidaturaTse: null,
        percentualVotos: null,
        idParlamentar: null,
        fotoUrl: null,
      });
    });
  });

  describe('getSeats', () => {
    it('should sum the seats of a party across the UFs, most seats first', async () => {
      prismaMock.eleicaoResultadoPartido.findMany.mockResolvedValue([
        linhaPartido('ABC', 2, 100),
        linhaPartido('XYZ', 5, 300),
        linhaPartido('ABC', 4, 250),
      ]);

      const result = await service.getSeats({ cargo: 'deputado federal', ano: 2026 });

      expect(result).toMatchObject({
        anoEleicao: 2026,
        cargo: 'DEPUTADO FEDERAL',
        uf: null,
        totalCadeiras: 11,
      });
      expect(result.data.map((p) => [p.siglaPartido, p.cadeiras, p.votos])).toEqual([
        ['ABC', 6, 350],
        ['XYZ', 5, 300],
      ]);
    });

    /**
     * O governador eleito no 2º turno tem a cadeira na linha do 2º turno e os
     * votos nas duas: somar os votos dos dois turnos contaria o eleitor em dobro.
     */
    it('should count seats from every round but votes only from the first', async () => {
      prismaMock.eleicaoResultadoPartido.findMany.mockResolvedValue([
        linhaPartido('ABC', 0, 400, 1),
        linhaPartido('ABC', 1, 600, 2),
      ]);

      const result = await service.getSeats({ cargo: 'GOVERNADOR', ano: 2026 });

      expect(result.data).toEqual([
        expect.objectContaining({ siglaPartido: 'ABC', cadeiras: 1, votos: 400 }),
      ]);
    });

    /** Presidente também é gravado por UF: sem isto, cada voto contaria duas vezes. */
    it('should use only the national row for PRESIDENTE', async () => {
      await service.getSeats({ cargo: 'presidente', ano: 2026 });

      expect(prismaMock.eleicaoResultadoPartido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resultado: { anoEleicao: 2026, cargo: 'PRESIDENTE', uf: 'BR' } },
        }),
      );
    });

    it('should honor an explicit uf', async () => {
      await service.getSeats({ cargo: 'SENADOR', ano: 2026, uf: 'sp' });

      expect(prismaMock.eleicaoResultadoPartido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resultado: { anoEleicao: 2026, cargo: 'SENADOR', uf: 'SP' } },
        }),
      );
    });

    it('should default to the most recent election', async () => {
      prismaMock.eleicaoResultado.aggregate.mockResolvedValue({
        _max: { anoEleicao: 2026 },
      });

      const result = await service.getSeats({ cargo: 'SENADOR' });

      expect(result.anoEleicao).toBe(2026);
    });

    it('should return an empty bancada when no result was loaded yet', async () => {
      prismaMock.eleicaoResultado.aggregate.mockResolvedValue({
        _max: { anoEleicao: null },
      });

      const result = await service.getSeats({ cargo: 'SENADOR' });

      expect(result).toEqual({
        anoEleicao: null,
        cargo: 'SENADOR',
        uf: null,
        totalCadeiras: 0,
        data: [],
      });
      expect(prismaMock.eleicaoResultadoPartido.findMany).not.toHaveBeenCalled();
    });
  });
});
