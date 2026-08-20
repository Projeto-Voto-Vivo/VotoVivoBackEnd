import { Router } from 'express';
import { VotingController } from '../controllers/voting.controller';
import { VotingService } from '../services/voting.service';
import { prisma } from '../lib/prisma';

const votingRouter = Router();

const votingService = new VotingService(prisma);
const votingController = new VotingController(votingService);

votingRouter.get('/votacoes', votingController.listVotings);

votingRouter.get('/votacoes/:id', votingController.getVotingById);

export { votingRouter };
