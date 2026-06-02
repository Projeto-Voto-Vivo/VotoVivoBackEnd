import { Router } from 'express';
import { ParliamentarianController } from '../controllers/parliamentarian.controller';
import { ParliamentarianService } from '../services/parliamentarian.service';
import { prisma } from '../lib/prisma';

const parliamentarianRouter = Router();

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
