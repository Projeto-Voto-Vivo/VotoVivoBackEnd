import { PrismaClient } from '@prisma/client';
import { NotFoundError } from './parliamentarian.service';

export class AmendmentService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAmendmentDetailsById(amendmentId: number) {
    const amendment = await this.prisma.amendment.findUnique({
      where: { id: amendmentId },
      include: {
        documents: {
          orderBy: {
            date: 'desc',
          },
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

    if (!amendment) {
      throw new NotFoundError('Emenda não encontrada.');
    }

    return {
      id: amendment.id,
      codigoEmenda: amendment.code,
      ano: amendment.year,
      tipoEmenda: amendment.amendmentType,
      autor: amendment.author,
      nomeAutor: amendment.authorName,
      numeroEmenda: amendment.amendmentNumber,
      localidadeDoGasto: amendment.spendingLocation,
      funcao: amendment.functionName,
      subfuncao: amendment.subfunctionName,
      valorEmpenhado: Number(amendment.committedAmount ?? 0),
      valorLiquidado: Number(amendment.liquidatedAmount ?? 0),
      valorPago: Number(amendment.paidAmount ?? 0),
      valorRestoInscrito: Number(amendment.remainderRegistered ?? 0),
      valorRestoCancelado: Number(amendment.remainderCanceled ?? 0),
      valorRestoPago: Number(amendment.remainderPaid ?? 0),
      parlamentares: amendment.parliamentarianLinks.map((link) => ({
        id: link.parliamentarian.id,
        nomeCivil: link.parliamentarian.civilName,
        nomeUrna: link.parliamentarian.ballotName,
        partidoAtual: link.parliamentarian.currentParty,
        uf: link.parliamentarian.state,
        fotoUrl: link.parliamentarian.photoUrl,
        metodoVinculo: link.linkMethod,
        confiancaVinculo: Number(link.confidence ?? 0),
      })),
      documentos: amendment.documents.map((document) =>
        this.mapDocumentToResponse(document),
      ),
    };
  }

  async listDocumentsByAmendmentId(amendmentId: number) {
    const amendment = await this.prisma.amendment.findUnique({
      where: { id: amendmentId },
      select: { id: true },
    });

    if (!amendment) {
      throw new NotFoundError('Emenda não encontrada.');
    }

    const documents = await this.prisma.amendmentDocument.findMany({
      where: {
        amendmentId,
      },
      orderBy: {
        date: 'desc',
      },
    });

    return documents.map((document) => this.mapDocumentToResponse(document));
  }

  private mapDocumentToResponse(document: {
    id: number;
    amendmentId: number;
    amendmentCode: string;
    date: Date | null;
    phase: string | null;
    documentCode: string | null;
    shortDocumentCode: string | null;
    speciesType: string | null;
    amendmentType: string | null;
  }) {
    return {
      id: document.id,
      idEmenda: document.amendmentId,
      codigoEmenda: document.amendmentCode,
      data: document.date ? document.date.toISOString().split('T')[0] : null,
      fase: document.phase,
      codigoDocumento: document.documentCode,
      codigoDocumentoResumido: document.shortDocumentCode,
      especieTipo: document.speciesType,
      tipoEmenda: document.amendmentType,
      urlPortal: this.buildPortalDocumentUrl(
        document.phase,
        document.documentCode,
      ),
    };
  }

  private buildPortalDocumentUrl(
    phase?: string | null,
    documentCode?: string | null,
  ) {
    if (!phase || !documentCode) {
      return null;
    }

    const normalizedPhase = phase
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const phaseMap: Record<string, string> = {
      empenho: 'empenho',
      liquidacao: 'liquidacao',
      pagamento: 'pagamento',
    };

    const portalPath = phaseMap[normalizedPhase];

    if (!portalPath) {
      return null;
    }

    return `https://portaldatransparencia.gov.br/despesas/documento/${portalPath}/${documentCode}`;
  }
}
