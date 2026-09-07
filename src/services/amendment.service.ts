import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/http-errors';

type AmendmentRow = {
  id: number;
  code: string;
  year: number | null;
  amendmentType: string | null;
  author: string | null;
  authorName: string | null;
  amendmentNumber: string | null;
  spendingLocation: string | null;
  functionName: string | null;
  subfunctionName: string | null;
  committedAmount: unknown;
  liquidatedAmount: unknown;
  paidAmount: unknown;
  remainderRegistered: unknown;
  remainderCanceled: unknown;
  remainderPaid: unknown;
};

type DocumentRow = {
  id: number;
  amendmentId: number;
  amendmentCode: string;
  date: Date | null;
  phase: string | null;
  documentCode: string | null;
  shortDocumentCode: string | null;
  speciesType: string | null;
  amendmentType: string | null;
};

type ParliamentarianLinkRow = {
  parliamentarianId: number;
  civilName: string | null;
  ballotName: string | null;
  currentParty: string | null;
  state: string | null;
  photoUrl: string | null;
  linkMethod: string | null;
  confidence: unknown;
};

export class AmendmentService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAmendmentDetailsById(amendmentId: number) {
    // $queryRaw contorna bug do @prisma/adapter-mariadb@7.8.0 que confunde
    // colunas ao usar findUnique/findFirst com include em modelos relacionados
    // que possuem campo idApi (string).
    const [amendments, documents, parliamentarianLinks] = await Promise.all([
      this.prisma.$queryRaw<AmendmentRow[]>`
        SELECT
          idEmenda           AS id,
          codigoEmenda       AS code,
          ano                AS year,
          tipoEmenda         AS amendmentType,
          autor              AS author,
          nomeAutor          AS authorName,
          numeroEmenda       AS amendmentNumber,
          localidadeDoGasto  AS spendingLocation,
          funcao             AS functionName,
          subfuncao          AS subfunctionName,
          valorEmpenhado     AS committedAmount,
          valorLiquidado     AS liquidatedAmount,
          valorPago          AS paidAmount,
          valorRestoInscrito AS remainderRegistered,
          valorRestoCancelado AS remainderCanceled,
          valorRestoPago     AS remainderPaid
        FROM emenda
        WHERE idEmenda = ${amendmentId}
      `,
      this.prisma.$queryRaw<DocumentRow[]>`
        SELECT
          idEmendaDocumento          AS id,
          idEmenda                   AS amendmentId,
          codigoEmenda               AS amendmentCode,
          data                       AS date,
          fase                       AS phase,
          codigoDocumento            AS documentCode,
          codigoDocumentoResumido    AS shortDocumentCode,
          especieTipo                AS speciesType,
          tipoEmenda                 AS amendmentType
        FROM emendaDocumento
        WHERE idEmenda = ${amendmentId}
        ORDER BY data DESC
      `,
      this.prisma.$queryRaw<ParliamentarianLinkRow[]>`
        SELECT
          p.idParlamentar  AS parliamentarianId,
          p.nomeCivil      AS civilName,
          p.nomeUrna       AS ballotName,
          p.partidoAtual   AS currentParty,
          p.uf             AS state,
          p.fotoUrl        AS photoUrl,
          ep.metodoVinculo AS linkMethod,
          ep.confiancaVinculo AS confidence
        FROM emendaParlamentar ep
        JOIN parlamentar p ON p.idParlamentar = ep.idParlamentar
        WHERE ep.idEmenda = ${amendmentId}
      `,
    ]);

    if (amendments.length === 0) {
      throw new NotFoundError('Emenda não encontrada.');
    }

    const amendment = amendments[0];

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
      parlamentares: parliamentarianLinks.map((link) => ({
        id: link.parliamentarianId,
        nomeCivil: link.civilName,
        nomeUrna: link.ballotName,
        partidoAtual: link.currentParty,
        uf: link.state,
        fotoUrl: link.photoUrl,
        metodoVinculo: link.linkMethod,
        confiancaVinculo: Number(link.confidence ?? 0),
      })),
      documentos: documents.map((document) =>
        this.mapDocumentToResponse(document),
      ),
    };
  }

  async listDocumentsByAmendmentId(amendmentId: number) {
    // Verifica existência antes de listar documentos
    const exists = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT idEmenda AS id FROM emenda WHERE idEmenda = ${amendmentId} LIMIT 1
    `;

    if (exists.length === 0) {
      throw new NotFoundError('Emenda não encontrada.');
    }

    const documents = await this.prisma.$queryRaw<DocumentRow[]>`
      SELECT
        idEmendaDocumento          AS id,
        idEmenda                   AS amendmentId,
        codigoEmenda               AS amendmentCode,
        data                       AS date,
        fase                       AS phase,
        codigoDocumento            AS documentCode,
        codigoDocumentoResumido    AS shortDocumentCode,
        especieTipo                AS speciesType,
        tipoEmenda                 AS amendmentType
      FROM emendaDocumento
      WHERE idEmenda = ${amendmentId}
      ORDER BY data DESC
    `;

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
