import { Router } from 'express';
import { RankingController } from '../controllers/ranking.controller';
import { RankingService } from '../services/ranking.service';
import { prisma } from '../lib/prisma';

const rankingRouter = Router();

const rankingService = new RankingService(prisma);
const rankingController = new RankingController(rankingService);

// `/filtros` antes de `/ranking` nao importa (caminhos distintos), mas os dois
// precisam ser registrados ANTES de `/parlamentares/:id` — ver routes/index.ts.
rankingRouter.get(
  '/parlamentares/ranking/filtros',
  rankingController.listRankingOptions,
);

rankingRouter.get('/parlamentares/ranking', rankingController.rankParliamentarians);

export { rankingRouter };
