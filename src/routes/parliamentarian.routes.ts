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
  '/parlamentares',
  parliamentarianController.listParliamentarians,
);

parliamentarianRouter.get(
  '/parlamentares/:id/perfil',
  parliamentarianController.getAggregatedProfile,
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
  '/parlamentares/:id/alinhamento',
  parliamentarianController.getAlignmentByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/temas',
  parliamentarianController.getThemeProfileByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/comissoes',
  parliamentarianController.listCommitteesByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/despesas/resumo',
  parliamentarianController.getExpenseSummaryByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/despesas',
  parliamentarianController.listExpensesByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/proposicoes',
  parliamentarianController.listPropositionsByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/votacoes',
  parliamentarianController.listVotingsByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id/presenca',
  parliamentarianController.getPresenceByParliamentarianId,
);

parliamentarianRouter.get(
  '/parlamentares/:id',
  parliamentarianController.getParliamentarianById,
);

export { parliamentarianRouter };
