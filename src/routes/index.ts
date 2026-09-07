import { Router } from 'express';
import { parliamentarianRouter } from './parliamentarian.routes';
import { votingRouter } from './voting.routes';
import { voteRouter } from './vote.routes';
import { propositionRouter } from './proposition.routes';
import { amendmentRouter } from './amendment.routes';
import { dashboardRouter } from './dashboard.routes';
import { rankingRouter } from './ranking.routes';
import { statsRouter } from './stats.routes';

const router = Router();

// ANTES do `parliamentarianRouter`: ele termina em `/parlamentares/:id`, que
// casaria com `/parlamentares/ranking` e trataria "ranking" como um id.
router.use(statsRouter);
router.use(rankingRouter);
router.use(parliamentarianRouter);
router.use(votingRouter);
router.use(voteRouter);
router.use(propositionRouter);
router.use(amendmentRouter);
router.use(dashboardRouter);

export { router };
