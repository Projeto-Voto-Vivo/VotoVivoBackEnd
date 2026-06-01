import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AmendmentController } from '../controllers/amendment.controller';
import { AmendmentService } from '../services/amendment.service';

const amendmentRouter = Router();
const prisma = new PrismaClient();

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
