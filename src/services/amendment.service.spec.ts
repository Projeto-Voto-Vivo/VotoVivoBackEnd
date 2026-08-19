import { AmendmentService } from './amendment.service';
import { NotFoundError } from './parliamentarian.service';

describe('AmendmentService', () => {
  let prismaMock: any;
  let service: AmendmentService;

  beforeEach(() => {
    prismaMock = {
      amendment: {
        findUnique: jest.fn(),
      },
      amendmentDocument: {
        findMany: jest.fn(),
      },
    };

    service = new AmendmentService(prismaMock);
  });

  describe('getAmendmentDetailsById', () => {
    it('should return amendment details with parliamentarians and documents', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({
        id: 1,
        code: 'EMD-2024-001',
        year: 2024,
        amendmentType: 'Individual',
        author: 'AUTOR1',
        authorName: 'João da Silva',
        amendmentNumber: '001',
        spendingLocation: 'São Paulo - SP',
        functionName: 'Saúde',
        subfunctionName: 'Atenção Básica',
        committedAmount: 100000,
        liquidatedAmount: 80000,
        paidAmount: 80000,
        remainderRegistered: 20000,
        remainderCanceled: 0,
        remainderPaid: 20000,
        parliamentarianLinks: [
          {
            parliamentarian: {
              id: 1,
              civilName: 'João Carlos da Silva',
              ballotName: 'João da Silva',
              currentParty: 'PT',
              state: 'SP',
              photoUrl: 'https://example.com/joao.jpg',
            },
            linkMethod: 'exact',
            confidence: 0.95,
          },
        ],
        documents: [
          {
            id: 1,
            amendmentId: 1,
            amendmentCode: 'EMD-2024-001',
            date: new Date('2024-02-10T00:00:00.000Z'),
            phase: 'Empenho',
            documentCode: 'DOC001',
            shortDocumentCode: 'D001',
            speciesType: 'Empenho',
            amendmentType: 'Individual',
          },
        ],
      });

      const result = await service.getAmendmentDetailsById(1);

      expect(prismaMock.amendment.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          documents: {
            orderBy: { date: 'desc' },
          },
          parliamentarianLinks: {
            include: {
              parliamentarian: {
                select: {
                  id: true,
                  civilName: true,
                  ballotName: true,
                  currentParty: true,
                  state: true,
                  photoUrl: true,
                },
              },
            },
          },
        },
      });

      expect(result).toEqual({
        id: 1,
        codigoEmenda: 'EMD-2024-001',
        ano: 2024,
        tipoEmenda: 'Individual',
        autor: 'AUTOR1',
        nomeAutor: 'João da Silva',
        numeroEmenda: '001',
        localidadeDoGasto: 'São Paulo - SP',
        funcao: 'Saúde',
        subfuncao: 'Atenção Básica',
        valorEmpenhado: 100000,
        valorLiquidado: 80000,
        valorPago: 80000,
        valorRestoInscrito: 20000,
        valorRestoCancelado: 0,
        valorRestoPago: 20000,
        parlamentares: [
          {
            id: 1,
            nomeCivil: 'João Carlos da Silva',
            nomeUrna: 'João da Silva',
            partidoAtual: 'PT',
            uf: 'SP',
            fotoUrl: 'https://example.com/joao.jpg',
            metodoVinculo: 'exact',
            confiancaVinculo: 0.95,
          },
        ],
        documentos: [
          {
            id: 1,
            idEmenda: 1,
            codigoEmenda: 'EMD-2024-001',
            data: '2024-02-10',
            fase: 'Empenho',
            codigoDocumento: 'DOC001',
            codigoDocumentoResumido: 'D001',
            especieTipo: 'Empenho',
            tipoEmenda: 'Individual',
            urlPortal:
              'https://portaldatransparencia.gov.br/despesas/documento/empenho/DOC001',
          },
        ],
      });
    });

    it('should use 0 for null monetary values', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({
        id: 1,
        code: 'EMD-2024-001',
        year: null,
        amendmentType: null,
        author: null,
        authorName: null,
        amendmentNumber: null,
        spendingLocation: null,
        functionName: null,
        subfunctionName: null,
        committedAmount: null,
        liquidatedAmount: null,
        paidAmount: null,
        remainderRegistered: null,
        remainderCanceled: null,
        remainderPaid: null,
        parliamentarianLinks: [],
        documents: [],
      });

      const result = await service.getAmendmentDetailsById(1);

      expect(result.valorEmpenhado).toBe(0);
      expect(result.valorLiquidado).toBe(0);
      expect(result.valorPago).toBe(0);
      expect(result.valorRestoInscrito).toBe(0);
      expect(result.valorRestoCancelado).toBe(0);
      expect(result.valorRestoPago).toBe(0);
    });

    it('should return null portal url when document phase is not mapped', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({
        id: 1,
        code: 'EMD-2024-001',
        year: null,
        amendmentType: null,
        author: null,
        authorName: null,
        amendmentNumber: null,
        spendingLocation: null,
        functionName: null,
        subfunctionName: null,
        committedAmount: null,
        liquidatedAmount: null,
        paidAmount: null,
        remainderRegistered: null,
        remainderCanceled: null,
        remainderPaid: null,
        parliamentarianLinks: [],
        documents: [
          {
            id: 1,
            amendmentId: 1,
            amendmentCode: 'EMD-2024-001',
            date: null,
            phase: 'Fase Desconhecida',
            documentCode: 'DOC001',
            shortDocumentCode: null,
            speciesType: null,
            amendmentType: null,
          },
        ],
      });

      const result = await service.getAmendmentDetailsById(1);
      expect(result.documentos[0].urlPortal).toBeNull();
    });

    it('should return null portal url when documentCode is null', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({
        id: 1,
        code: 'EMD-2024-001',
        year: null,
        amendmentType: null,
        author: null,
        authorName: null,
        amendmentNumber: null,
        spendingLocation: null,
        functionName: null,
        subfunctionName: null,
        committedAmount: null,
        liquidatedAmount: null,
        paidAmount: null,
        remainderRegistered: null,
        remainderCanceled: null,
        remainderPaid: null,
        parliamentarianLinks: [],
        documents: [
          {
            id: 1,
            amendmentId: 1,
            amendmentCode: 'EMD-2024-001',
            date: null,
            phase: 'Empenho',
            documentCode: null,
            shortDocumentCode: null,
            speciesType: null,
            amendmentType: null,
          },
        ],
      });

      const result = await service.getAmendmentDetailsById(1);
      expect(result.documentos[0].urlPortal).toBeNull();
    });

    it('should throw NotFoundError when amendment does not exist', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue(null);

      await expect(
        service.getAmendmentDetailsById(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listDocumentsByAmendmentId', () => {
    it('should return mapped documents for an amendment', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentDocument.findMany.mockResolvedValue([
        {
          id: 2,
          amendmentId: 1,
          amendmentCode: 'EMD-2024-001',
          date: new Date('2024-02-10T00:00:00.000Z'),
          phase: 'Liquidação',
          documentCode: 'DOC002',
          shortDocumentCode: 'D002',
          speciesType: 'Liquidação',
          amendmentType: 'Individual',
        },
      ]);

      const result = await service.listDocumentsByAmendmentId(1);

      expect(prismaMock.amendmentDocument.findMany).toHaveBeenCalledWith({
        where: { amendmentId: 1 },
        orderBy: { date: 'desc' },
      });

      expect(result).toEqual([
        {
          id: 2,
          idEmenda: 1,
          codigoEmenda: 'EMD-2024-001',
          data: '2024-02-10',
          fase: 'Liquidação',
          codigoDocumento: 'DOC002',
          codigoDocumentoResumido: 'D002',
          especieTipo: 'Liquidação',
          tipoEmenda: 'Individual',
          urlPortal:
            'https://portaldatransparencia.gov.br/despesas/documento/liquidacao/DOC002',
        },
      ]);
    });

    it('should build correct url for pagamento phase', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentDocument.findMany.mockResolvedValue([
        {
          id: 3,
          amendmentId: 1,
          amendmentCode: 'EMD-2024-001',
          date: null,
          phase: 'Pagamento',
          documentCode: 'DOC003',
          shortDocumentCode: null,
          speciesType: null,
          amendmentType: null,
        },
      ]);

      const result = await service.listDocumentsByAmendmentId(1);
      expect(result[0].urlPortal).toBe(
        'https://portaldatransparencia.gov.br/despesas/documento/pagamento/DOC003',
      );
    });

    it('should return null date when document date is null', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.amendmentDocument.findMany.mockResolvedValue([
        {
          id: 1,
          amendmentId: 1,
          amendmentCode: 'EMD-2024-001',
          date: null,
          phase: null,
          documentCode: null,
          shortDocumentCode: null,
          speciesType: null,
          amendmentType: null,
        },
      ]);

      const result = await service.listDocumentsByAmendmentId(1);
      expect(result[0].data).toBeNull();
      expect(result[0].urlPortal).toBeNull();
    });

    it('should throw NotFoundError when amendment does not exist', async () => {
      prismaMock.amendment.findUnique.mockResolvedValue(null);

      await expect(
        service.listDocumentsByAmendmentId(999),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
