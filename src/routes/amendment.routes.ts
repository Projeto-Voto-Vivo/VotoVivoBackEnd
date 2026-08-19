import { Router } from 'express';
import { AmendmentController } from '../controllers/amendment.controller';
import { AmendmentService } from '../services/amendment.service';
import { prisma } from '../lib/prisma';

const amendmentRouter = Router();

const amendmentService = new AmendmentService(prisma);
const amendmentController = new AmendmentController(amendmentService);

amendmentRouter.get(
  '/emendas/:id/detalhes',
  amendmentController.getAmendmentDetailsById,
);

amendmentRouter.get(
  '/emendas/:id/documentos',
  amendmentController.listDocumentsByAmendmentId,
);

export { amendmentRouter };
