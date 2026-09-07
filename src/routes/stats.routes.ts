import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';
import { StatsService } from '../services/stats.service';
import { prisma } from '../lib/prisma';

const statsRouter = Router();

const statsService = new StatsService(prisma);
const statsController = new StatsController(statsService);

statsRouter.get('/stats/emendas/total', statsController.getTotalPaidAmendments);
statsRouter.get('/stats/despesas/ranking', statsController.getExpenseRanking);
statsRouter.get('/stats/emendas/ranking', statsController.getAmendmentRanking);

export { statsRouter };
