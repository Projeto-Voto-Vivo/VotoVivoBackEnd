import express, { Router } from 'express';
import request from 'supertest';
import { AmendmentController } from './amendment.controller';
import { NotFoundError } from '../services/parliamentarian.service';
import { errorHandler } from '../middlewares/error-handler';

describe('AmendmentController', () => {
  let app: express.Express;

  const serviceMock = {
    getAmendmentDetailsById: jest.fn(),
    listDocumentsByAmendmentId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new AmendmentController(serviceMock as any);
    const router = Router();

    router.get('/emendas/:id/detalhes', controller.getAmendmentDetailsById);
    router.get('/emendas/:id/documentos', controller.listDocumentsByAmendmentId);

    app = express();
    app.use(express.json());
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /emendas/:id/detalhes', () => {
    it('should return 200 and amendment details', async () => {
      serviceMock.getAmendmentDetailsById.mockResolvedValue({
        id: 1,
        codigoEmenda: 'EMD-2024-001',
        ano: 2024,
        tipoEmenda: 'Individual',
        parlamentares: [],
        documentos: [],
      });

      const response = await request(app).get('/emendas/1/detalhes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 1,
        codigoEmenda: 'EMD-2024-001',
        ano: 2024,
        tipoEmenda: 'Individual',
        parlamentares: [],
        documentos: [],
      });

      expect(serviceMock.getAmendmentDetailsById).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/emendas/abc/detalhes');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Parâmetro inválido: id.',
      });

      expect(serviceMock.getAmendmentDetailsById).not.toHaveBeenCalled();
    });

    it('should return 404 when amendment is not found', async () => {
      serviceMock.getAmendmentDetailsById.mockRejectedValue(
        new NotFoundError('Emenda não encontrada.'),
      );

      const response = await request(app).get('/emendas/999/detalhes');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Emenda não encontrada.',
      });
    });

    it('should return 500 on unexpected service error', async () => {
      serviceMock.getAmendmentDetailsById.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const response = await request(app).get('/emendas/1/detalhes');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Erro interno do servidor.',
      });
    });
  });

  describe('GET /emendas/:id/documentos', () => {
    it('should return 200 and list of documents', async () => {
      serviceMock.listDocumentsByAmendmentId.mockResolvedValue([
        {
          id: 1,
          idEmenda: 1,
          codigoEmenda: 'EMD-2024-001',
          data: '2024-02-10',
          fase: 'Empenho',
          codigoDocumento: 'DOC001',
          urlPortal:
            'https://portaldatransparencia.gov.br/despesas/documento/empenho/DOC001',
        },
      ]);

      const response = await request(app).get('/emendas/1/documentos');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          id: 1,
          idEmenda: 1,
          codigoEmenda: 'EMD-2024-001',
          data: '2024-02-10',
          fase: 'Empenho',
          codigoDocumento: 'DOC001',
          urlPortal:
            'https://portaldatransparencia.gov.br/despesas/documento/empenho/DOC001',
        },
      ]);

      expect(serviceMock.listDocumentsByAmendmentId).toHaveBeenCalledWith(1);
    });

    it('should return 400 when id is invalid', async () => {
      const response = await request(app).get('/emendas/abc/documentos');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Parâmetro inválido: id.',
      });

      expect(serviceMock.listDocumentsByAmendmentId).not.toHaveBeenCalled();
    });

    it('should return 404 when amendment is not found', async () => {
      serviceMock.listDocumentsByAmendmentId.mockRejectedValue(
        new NotFoundError('Emenda não encontrada.'),
      );

      const response = await request(app).get('/emendas/999/documentos');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Emenda não encontrada.',
      });
    });

    it('should return 500 on unexpected service error', async () => {
      serviceMock.listDocumentsByAmendmentId.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const response = await request(app).get('/emendas/1/documentos');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Erro interno do servidor.',
      });
    });
  });
});
