import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { PropositionController } from '../controllers/proposition.controller';
import { PropositionService } from '../services/proposition.service';

const propositionRouter = Router();
const prisma = new PrismaClient();

const propositionService = new PropositionService(prisma);
const propositionController = new PropositionController(
  propositionService,
);

propositionRouter.get(
  '/proposicoes',
  propositionController.listPropositions,
);

propositionRouter.get(
  '/proposicoes/:id',
  propositionController.getPropositionById,
);

propositionRouter.post(
  '/proposicoes',
  propositionController.createProposition,
);

export { propositionRouter };