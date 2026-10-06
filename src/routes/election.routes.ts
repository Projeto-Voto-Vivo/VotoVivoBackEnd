import { Router } from 'express';
import { ElectionController } from '../controllers/election.controller';
import { ElectionService } from '../services/election.service';
import { prisma } from '../lib/prisma';

const electionRouter = Router();

const electionService = new ElectionService(prisma);
const electionController = new ElectionController(electionService);

electionRouter.get('/eleicoes/bancadas', electionController.getSeats);
electionRouter.get('/eleicoes/resultados', electionController.listResults);
electionRouter.get('/eleicoes/resultados/:id', electionController.getResultById);
electionRouter.get(
  '/eleicoes/resultados/:id/candidatos',
  electionController.listResultCandidates,
);

export { electionRouter };
