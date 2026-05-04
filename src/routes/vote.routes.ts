import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { VoteController } from '../controllers/vote.controller';
import { VoteService } from '../services/vote.service';

const voteRouter = Router();
const prisma = new PrismaClient();

const voteService = new VoteService(prisma);
const voteController = new VoteController(voteService);

voteRouter.get(
  '/votacoes/:votingId/votos',
  voteController.listVotesByVoting,
);

voteRouter.post(
    '/votos',
    voteController.createVote
);

voteRouter.delete(
    '/votos/:id',
    voteController.deleteVote
);

export { voteRouter };