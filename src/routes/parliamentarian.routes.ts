import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ParliamentarianController } from '../controllers/parliamentarian.controller';
import { ParliamentarianService } from '../services/parliamentarian.service';

const parliamentarianRouter = Router();
const prisma = new PrismaClient();

const parliamentarianService = new ParliamentarianService(prisma);
const parliamentarianController = new ParliamentarianController(
  parliamentarianService,
);

parliamentarianRouter.get(
  '/parlamentar',
  parliamentarianController.listParliamentarians,
);

parliamentarianRouter.get(
  '/parlamentares/:id/emendas/resumo',
  parliamentarianController.getAmendmentSummaryByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/proposicoes',
  parliamentarianController.listPropositionsByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/emendas',
  parliamentarianController.listAmendmentsByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id',
  parliamentarianController.getParliamentarianById,
);

parliamentarianRouter.get(
  '/parlamentares/:id/gastos',
  parliamentarianController.listExpensesByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/gastos/resumo',
  parliamentarianController.getExpenseSummaryByParliamentarianId,
);

export { parliamentarianRouter };
