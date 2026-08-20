import { Router } from 'express';
import { VoteController } from '../controllers/vote.controller';
import { VoteService } from '../services/vote.service';
import { prisma } from '../lib/prisma';

const voteRouter = Router();

const voteService = new VoteService(prisma);
const voteController = new VoteController(voteService);

voteRouter.get('/votacoes/:votingId/votos', voteController.listVotesByVoting);

export { voteRouter };
