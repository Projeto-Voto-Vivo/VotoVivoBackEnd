import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { VotingController } from '../controllers/voting.controller';
import { VotingService } from '../services/voting.service';

const votingRouter = Router();
const prisma = new PrismaClient();

const votingService = new VotingService(prisma);
const votingController = new VotingController(votingService);

votingRouter.get(
    '/votacoes',
    votingController.listVotings
);

votingRouter.get(
    '/votacoes/:id',
    votingController.getVotingById
);

votingRouter.post(
    '/votacoes',
    votingController.createVoting
);

export { votingRouter };
