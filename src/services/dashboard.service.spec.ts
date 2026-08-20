import { DashboardService } from './dashboard.service';
import { InvalidParameterError, NotFoundError } from '../errors/http-errors';

describe('DashboardService', () => {
  let prismaMock: any;
  let service: DashboardService;

  beforeEach(() => {
    prismaMock = {
      amendment: { aggregate: jest.fn() },
      expense: { aggregate: jest.fn() },
      parliamentarian: { findMany: jest.fn(), findUnique: jest.fn() },
      partyAffiliation: { count: jest.fn() },
      mandateTerm: { findMany: jest.fn() },
      presence: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    };

    service = new DashboardService(prismaMock);
  });

  describe('getTotalEmendas', () => {
    it('should sum the requested metric column and declare it', async () => {
      prismaMock.amendment.aggregate.mockResolvedValue({
        _sum: { paidAmount: '4200000.00' },
        _count: { _all: 3 },
      });

      const result = await service.getTotalEmendas({ ano: 2024, metrica: 'pago' });

      expect(prismaMock.amendment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { year: 2024 },
          _sum: { paidAmount: true },
        }),
      );
      // SUM(DECIMAL) volta como string no driver: nunca pode vazar assim.
      expect(result.total).toBe(4200000);
      expect(typeof result.total).toBe('number');
      expect(result.metadata.metrica).toBe('pago');
    });

    it('should return 0 when there is nothing to sum', async () => {
      prismaMock.amendment.aggregate.mockResolvedValue({
        _sum: { committedAmount: null },
        _count: { _all: 0 },
      });

      const result = await service.getTotalEmendas({ metrica: 'empenhado' });

      expect(result.total).toBe(0);
      expect(result.metadata.janela).toEqual({ ano: 'todos' });
    });
  });

  describe('getTopEmendas', () => {
    it('should convert BigInt/string columns and declare the exclusions', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        {
          id: 1,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          cargo: 'Deputado(a)',
          totalEmendas: BigInt(2),
          valor: '1500000.00',
        },
      ]);

      const result = await service.getTopEmendas({
        casa: 'camara',
        limit: 10,
        confiancaMinima: 0,
        metrica: 'empenhado',
      });

      expect(result.data[0].totalEmendas).toBe(2);
      expect(result.data[0].valor).toBe(1500000);
      // JSON.stringify(BigInt) lanca TypeError — a conversao e obrigatoria.
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(result.metadata.exclusoes[0]).toMatch(/sem vínculo/);
    });

    it('should reject an unknown casa', async () => {
      await expect(
        service.getTopEmendas({
          casa: 'assembleia',
          limit: 10,
          confiancaMinima: 0,
          metrica: 'empenhado',
        }),
      ).rejects.toBeInstanceOf(InvalidParameterError);

      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('getTopDespesas', () => {
    it('should return totals without normalization by default', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        {
          id: 1,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          total: '2481.25',
          mesesExercicio: BigInt(14),
          totalNormalizado: '177.23',
        },
      ]);

      const result = await service.getTopDespesas({ casa: 'camara', limit: 10 });

      expect(result.data[0].total).toBe(2481.25);
      expect(result.data[0].totalNormalizado).toBeNull();
      expect(result.metadata.normalizacao).toBe('nenhuma');
    });

    it('should expose the normalized value when normalizar=mes', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        {
          id: 1,
          nomeParlamentar: 'João da Silva',
          siglaPartido: 'PT',
          uf: 'SP',
          total: '2800.00',
          mesesExercicio: BigInt(14),
          totalNormalizado: '200.00',
        },
      ]);

      const result = await service.getTopDespesas({
        casa: 'camara',
        limit: 10,
        normalizar: 'mes',
      });

      expect(result.data[0].totalNormalizado).toBe(200);
      expect(result.metadata.normalizacao).toMatch(/mês de exercício/);
    });

    it('should reject an unsupported normalization', async () => {
      await expect(
        service.getTopDespesas({ casa: 'camara', limit: 10, normalizar: 'ano' }),
      ).rejects.toBeInstanceOf(InvalidParameterError);
    });
  });

  describe('compare', () => {
    const parlamentares = (roles: string[]) =>
      roles.map((role, index) => ({
        id: index + 1,
        ballotName: `Parlamentar ${index + 1}`,
        currentParty: 'PT',
        state: 'SP',
        role,
      }));

    beforeEach(() => {
      prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: '1200.00' } });
      prismaMock.amendment.aggregate.mockResolvedValue({
        _sum: { committedAmount: '900000.00' },
      });
      prismaMock.mandateTerm.findMany.mockResolvedValue([]);
      prismaMock.presence.findMany.mockResolvedValue([]);
      prismaMock.partyAffiliation.count.mockResolvedValue(1);
      prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Deputado(a)' });
      prismaMock.$queryRaw.mockResolvedValue([{ meses: BigInt(24) }]);
    });

    it('should normalize expenses by months in office', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue(
        parlamentares(['Deputado(a)', 'Deputado(a)']),
      );

      const result = await service.compare({
        ids: [1, 2],
        permitirCasasDistintas: false,
        metrica: 'empenhado',
      });

      expect(result.data[0].mesesExercicio).toBe(24);
      expect(result.data[0].despesas.porMesDeExercicio).toBe(50);
      expect(result.metadata.comparacaoEntreCasas).toBe(false);
    });

    it('should return null per-month expense when there is no term data', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue(
        parlamentares(['Deputado(a)', 'Deputado(a)']),
      );
      prismaMock.$queryRaw.mockResolvedValue([{ meses: null }]);

      const result = await service.compare({
        ids: [1, 2],
        permitirCasasDistintas: false,
        metrica: 'empenhado',
      });

      expect(result.data[0].despesas.porMesDeExercicio).toBeNull();
    });

    /**
     * Presenca, cota e emendas seguem regras distintas em cada casa: um grafico
     * lado a lado sugere equivalencia que nao existe.
     */
    it('should refuse to compare across houses without the explicit flag', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue(
        parlamentares(['Deputado(a)', 'Senador(a)']),
      );

      await expect(
        service.compare({
          ids: [1, 2],
          permitirCasasDistintas: false,
          metrica: 'empenhado',
        }),
      ).rejects.toBeInstanceOf(InvalidParameterError);
    });

    it('should allow cross-house comparison when explicitly requested', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue(
        parlamentares(['Deputado(a)', 'Senador(a)']),
      );

      const result = await service.compare({
        ids: [1, 2],
        permitirCasasDistintas: true,
        metrica: 'empenhado',
      });

      expect(result.metadata.comparacaoEntreCasas).toBe(true);
    });

    it('should reject more than four parliamentarians', async () => {
      await expect(
        service.compare({
          ids: [1, 2, 3, 4, 5],
          permitirCasasDistintas: false,
          metrica: 'empenhado',
        }),
      ).rejects.toBeInstanceOf(InvalidParameterError);
    });

    it('should reject a single parliamentarian', async () => {
      await expect(
        service.compare({ ids: [1], permitirCasasDistintas: false, metrica: 'pago' }),
      ).rejects.toBeInstanceOf(InvalidParameterError);
    });

    it('should throw NotFoundError when an id does not exist', async () => {
      prismaMock.parliamentarian.findMany.mockResolvedValue(
        parlamentares(['Deputado(a)']),
      );

      await expect(
        service.compare({
          ids: [1, 999],
          permitirCasasDistintas: false,
          metrica: 'empenhado',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
