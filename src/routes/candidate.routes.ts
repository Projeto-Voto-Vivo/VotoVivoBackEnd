import { Router } from 'express';
import { CandidateController } from '../controllers/candidate.controller';
import { CandidateService } from '../services/candidate.service';
import { prisma } from '../lib/prisma';

const candidateRouter = Router();

const candidateService = new CandidateService(prisma);
const candidateController = new CandidateController(candidateService);

candidateRouter.get(
  '/candidatos',
  candidateController.listCandidates,
);

candidateRouter.get(
  '/candidatos/:id',
  candidateController.getCandidateById,
);

export { candidateRouter };