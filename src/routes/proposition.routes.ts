import { Router } from 'express';
import { PropositionController } from '../controllers/proposition.controller';
import { PropositionService } from '../services/proposition.service';
import { prisma } from '../lib/prisma';

const propositionRouter = Router();

const propositionService = new PropositionService(prisma);
const propositionController = new PropositionController(propositionService);

propositionRouter.get('/proposicoes', propositionController.listPropositions);

// Antes de `/proposicoes/:id`: registrada depois, a rota de id capturaria
// "filtros" e responderia 400.
propositionRouter.get('/proposicoes/filtros', propositionController.listFilterOptions);

propositionRouter.get(
  '/proposicoes/:id/tramitacoes',
  propositionController.listTramitacoes,
);

propositionRouter.get('/proposicoes/:id', propositionController.getPropositionById);

export { propositionRouter };
