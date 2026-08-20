import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { DashboardService } from '../services/dashboard.service';
import { prisma } from '../lib/prisma';

const dashboardRouter = Router();

const dashboardService = new DashboardService(prisma);
const dashboardController = new DashboardController(dashboardService);

dashboardRouter.get('/dashboards/emendas/total', dashboardController.getTotalEmendas);

dashboardRouter.get('/dashboards/emendas/top', dashboardController.getTopEmendas);

dashboardRouter.get('/dashboards/despesas/top', dashboardController.getTopDespesas);

dashboardRouter.get('/dashboards/comparacao', dashboardController.compare);

export { dashboardRouter };
